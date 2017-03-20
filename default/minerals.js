var utils = require('utils');
const profiler = require('screeps-profiler');

var minerals = {
    needList: {
        "sim": {
            "LO": 100,
        },
    },
    library: {},
    orders: null,
    labCache: {},

    init: function () {
        for (let rt1 in REACTIONS)
            for (let rt2 in REACTIONS)
                this.library[REACTIONS[rt1][rt2]] = {
                    inputTypes: [rt1, rt2],
                };
    },

    getInputTypes: function (rt) {
        if (!(rt in this.library))
            return null;
        
        return this.library[rt].inputTypes;
    },

    getMaxCost: function (resourceType, amount = 1000, roomName = "W48N4") {
        if (!this.orders)
            this.orders = Game.market.getAllOrders({type: ORDER_BUY});
        
        let credits = 0;
        let energy = 0;
        let leftAmount = amount;
        for (let order of _.filter(this.orders, o => o.resourceType == resourceType).sort((a,b) => b.price - a.price)) {
            if (leftAmount <= 0)
                break;
            let curAmount = _.min([leftAmount, order.remainingAmount]);
            credits += order.price * curAmount;
            leftAmount -= curAmount;
            energy += Game.market.calcTransactionCost(curAmount, order.roomName, roomName); 
        }

        return {credits, energy, amount: amount - leftAmount};
    },

    searchCombination: function (roomName = "W48N4", elems) { // second+ args - array of elems
        let res = {};
        for (let elem1 of elems) {
            let rt1 = elem1.resourceType;
            if (!(rt1 in REACTIONS))
                continue;
            for (let elem2 of elems) {
                let rt2 = elem2.resourceType;
                let amount = _.min([elem1.amount, elem2.amount]);
                if (rt1 == rt2 || !(rt2 in REACTIONS[rt1]) || REACTIONS[rt1][rt2] in res)
                    continue;
                let cost = this.getMaxCost(REACTIONS[rt1][rt2], amount, roomName);
                res[REACTIONS[rt1][rt2]] = {resourceTypes: [rt1, rt2], amount: cost.amount, credits: cost.credits, energy: cost.energy};
            }
        }

        return res;
    },

    calcSelling: function (roomName) {
        let room = Game.rooms[roomName];
        if (!room)
            return null;
        
        let storage = room.storage;
        if (!storage)
            return null;
        
        let elems = [];
        for (let resourceType in storage.store) {
            if (storage.store[resourceType] < MIN_RES_AMOUNT + MIN_RES_SELLING_AMOUNT)
                continue;
            elems.push({
                resourceType,
                amount: storage.store[resourceType] - MIN_RES_AMOUNT,
            });
        }

        if (!elems.length)
            return null;
        
        return this.searchCombination(roomName, elems);
    },

    checkNeeds: function (roomName) {
        if (!(roomName in this.needList))
            return null;
        let room = Game.rooms[roomName];
        if (!room)
            return null;
        let storage = room.storage;
        if (!storage)
            return null;
        let terminal = room.terminal;
        if (!terminal)
            return null;
        
        for (let rt in this.needList[roomName]) {
            let amount = (storage.store[rt] || 0) + (terminal.store[rt] || 0) + global.cache.queueLab.getProducing(roomName, rt);
            if (amount > this.needList[roomName][rt])
                continue;
            
            global.cache.queueLab.addRequest(roomName, rt, _.min([this.needList[roomName][rt] - amount, LAB_REQUEST_AMOUNT]), LAB_REQUEST_TYPE_TERMINAL);
        }

        return OK;
    },

    loadLabs: function () {
        let res = [];
        for (let i =0; i < arguments.length; i++) {
            let labID = arguments[i];
            if (!(labID in this.labCache))
                    this.labCache[labID] = Game.getObjectById(labID);
            res.push(this.labCache[labID]);
        }
        return res;
    },

    checkLabs: function (roomName) {
        let room = Game.rooms[roomName];
        if (!room)
            return null;
        let storage = room.storage;
        if (!storage)
            return null;
        let terminal = room.terminal;
        if (!terminal)
            return null;
        let labs = room.getLabs();
        if (!labs.length)
            return null;
        
        for (let request of _.filter(Memory.labRequests, r => r.roomName == roomName).sort((a,b) => b.stage - a.stage || a.type - b.type)) {
            if (request.stage == LAB_REQUEST_STAGE_PROCCESSING) {
                let lab1 = this.loadLabs(request.lab1ID);
                let lab2 = this.loadLabs(request.lab2ID);
                if (!lab1 || !lab2) {
                    console.log(`checkLabs: roomName=${roomName}, lab1=${lab1}, lab2=${lab2}, ID=${request.id}`);
                    global.cache.queueLab.badRequest(request.id);
                    continue;
                }
                if (!lab1.mineralAmount || !lab2.mineralAmount)
                    continue;

                if (   lab1.mineralType != request.inputType1
                    || lab2.mineralType != request.inputType2
                ) {
                    console.log(`checkLabs: bad mineralType, roomName=${roomName}, lab1=${lab1.id} with ${lab1.mineralType} lab2=${lab2.id} with ${lab2.mineralType}, ID=${request.id}`);
                    continue;
                }

                for (let labID of request.outputLabs) {
                    let lab = this.loadLabs(labID);
                    if (!lab) {
                        console.log(`checkLabs: bad output lab (${labID}) in reqID=${request.id}`);
                        global.cache.queueLab.badRequest(request.id);
                        continue;
                    }

                    if (lab.mineralType != request.outputType) {
                        console.log(`checkLabs: bad output mineralType, roomName=${roomName}, output lab=${labID} with ${lab.mineralType} instead of ${request.outputType}, ID=${request.id}`);
                        continue;
                    }

                    //let res = lab.runReaction(lab1, lab2);
                    console.log(`checkLabs: runReaction(lab1, lab2) for reqID=${request.id}`);
                }
            } else if (request.stage == LAB_REQUEST_STAGE_PREPARE) {

            } else if (request.stage == LAB_REQUEST_STAGE_CREATED) {
                let wait = 0;
                let roomAmount1 = room.getAmount(request.inputType1) + global.cache.queueLab.getFreeAmount(roomName, request.inputType1);
                if (roomAmount1 < request.amount) {
                    global.cache.queueLab.addRequest(roomName, request.inputType1, request.amount - roomAmount1, LAB_REQUEST_TYPE_REACTION);
                    wait = 1;
                }
                let roomAmount2 = room.getAmount(request.inputType2) + global.cache.queueLab.getFreeAmount(roomName, request.inputType2);
                if (roomAmount2 < request.amount) {
                    global.cache.queueLab.addRequest(roomName, request.inputType2, request.amount - roomAmount2, LAB_REQUEST_TYPE_REACTION);
                    wait = 1;
                }
                
                if (wait)
                    continue;

                let lab1ID = global.cache.queueLab.searchLabs(roomName, request.inputType1)[0] || global.cache.queueLab.getFreeLab(room);
                let lab2ID = global.cache.queueLab.searchLabs(roomName, request.inputType2)[0] || global.cache.queueLab.getFreeLab(room, [lab1ID]);
                let outputLabID = global.cache.queueLab.searchLabs(roomName, request.outputType)[0] || global.cache.queueLab.getFreeLab(room, [lab1ID, lab2ID]);
                if (!lab1ID || !lab2ID || !outputLabID) {
                    console.log(`checkLabs: not enough labs lab1=${lab1ID}, lab2=${lab2ID}, output=${outputLabID}`);
                    continue;
                }

                global.cache.queueLab.setRequestLabs(request.id, lab1ID, lab2ID, outputLabID);
                console.log(`checkLabs: setRequestLabs for reqID=${request.id}`);
            }
        }
    },
};

module.exports = minerals;
profiler.registerObject(minerals, 'Minerals');