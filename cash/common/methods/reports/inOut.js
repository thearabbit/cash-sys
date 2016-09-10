import {Meteor} from 'meteor/meteor';
import {ValidatedMethod} from 'meteor/mdg:validated-method';
import {SimpleSchema} from 'meteor/aldeed:simple-schema';
import {CallPromiseMixin} from 'meteor/didericis:callpromise-mixin';
import {_} from 'meteor/erasaur:meteor-lodash';
import {moment} from  'meteor/momentjs:moment';

// Collection
import {Company} from '../../../../core/common/collections/company';
import {Branch} from '../../../../core/common/collections/branch';
import {Exchange} from '../../../../core/common/collections/exchange';

import {Transaction} from '../../collections/transaction';

export const inOutReport = new ValidatedMethod({
    name: 'cash.inOutReport',
    mixins: [CallPromiseMixin],
    validate: null,
    run(params) {
        if (!this.isSimulation) {
            Meteor._sleepForMs(200);

            let rptTitle, rptHeader, rptContent;

            let fDate = moment(params.repDate[0]).toDate();
            let tDate = moment(params.repDate[1]).add(1, 'days').toDate();

            // --- Title ---
            rptTitle = Company.findOne();

            // --- Header ---
            // Branch
            let branchDoc = Branch.find({_id: {$in: params.branchId}});
            params.branchHeader = _.map(branchDoc.fetch(), function (val) {
                return `${val._id} : ${val.enName}`;
            });

            // Exchange
            let exchangeDoc = Exchange.findOne(params.exchangeId);
            params.exchangeHeader = JSON.stringify(exchangeDoc.rates, null, ' ');

            rptHeader = params;

            // --- Content ---
            let selector = {};
            selector.branchId = {$in: params.branchId};
            selector.currencyId = {$in: params.currencyId};
            selector.transactionDate = {$gte: fDate, $lte: tDate};
            selector.cashType = params.cashType;

            rptContent = Transaction.aggregate([
                {
                    $match: selector
                },
                {
                    $unwind: "$items"
                },
                {
                    $lookup: {
                        from: "cash_chart",
                        localField: "items.chartCashId",
                        foreignField: "_id",
                        as: "chartCashDoc"
                    }
                },
                {
                    $unwind: "$chartCashDoc"
                },
                {
                    $project: {
                        currencyId: 1, items: 1, chartCashDoc: 1,
                        chartCashLabel: {
                            $concat: ["$chartCashDocDoc._id", " : ", "$chartCashDoc.name"]
                        }
                    }
                },
                {
                    $group: {
                        _id: {
                            currencyId: "$currencyId",
                            chartCashId: "$items.chartCashId"
                        },
                        chartCashDoc: {$last: "$chartCashDoc"},
                        sumAmount: {$sum: "$items.amount"}
                    }
                },
                {
                    $group: {
                        _id: "$_id.chartCashId",
                        chartCashDoc: {$last: "$chartCashDoc"},
                        amountKHR: {
                            $sum: {
                                $cond: {
                                    if: {
                                        $eq: ["$_id.currencyId", "KHR"]
                                    },
                                    then: "$sumAmount",
                                    else: 0
                                }
                            }
                        },
                        amountUSD: {
                            $sum: {
                                $cond: {
                                    if: {
                                        $eq: ["$_id.currencyId", "USD"]
                                    },
                                    then: "$sumAmount",
                                    else: 0
                                }
                            }
                        },
                        amountTHB: {
                            $sum: {
                                $cond: {
                                    if: {
                                        $eq: ["$_id.currencyId", "THB"]
                                    },
                                    then: "$sumAmount",
                                    else: 0
                                }
                            }
                        },
                        amountAsUSD: {
                            $sum: {
                                $cond: {
                                    if: {$eq: ["$_id.currencyId", "KHR"]},
                                    then: {$divide: ["$sumAmount", exchangeDoc.rates.KHR]},
                                    else: {
                                        $cond: {
                                            if: {$eq: ["$_id.currencyId", "THB"]},
                                            then: {$divide: ["$sumAmount", exchangeDoc.rates.THB]},
                                            else: "$sumAmount"
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                {
                    $sort: {_id: 1}
                },
                {
                    $group: {
                        _id: null,
                        data: {$push: "$$ROOT"},
                        totalKHR: {
                            $sum: "$amountKHR"
                        },
                        totalUSD: {
                            $sum: "$amountUSD"
                        },
                        totalTHB: {
                            $sum: "$amountTHB"
                        },
                        totalAsUSD: {
                            $sum: "$amountAsUSD"
                        }
                    }
                }
            ])[0];

            return {rptTitle, rptHeader, rptContent};
        }
    }
});
