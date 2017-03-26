var utils = require('utils');
const profiler = require('screeps-profiler');

var queue = {
    producing: {},
    reserved: {},
    
    init: function () {
        Memory.labRequests = Memory.labRequests || {};
        for (let reqID in Memory.labRequests) {
            let request = Memory.labRequests[reqID];
            if (request.stage < LAB_REQUEST_STAGE_PREPARE)
                continue;
        }
    },
/*
    reserveLab: function(labID, rt, amount) {
        if (labID in this.reserved) {
            if (this.reserved[labID].resourceType == rt) {
                this.reserved[labID].amount += amount;
            } else {
                console.log("minerals.reserveLab: diff types in labID=" + labID + ", reserved=" + this.reserved[labID].resourceType + ", request=" + rt);
                return ERR_INVALID_TARGET;
            }
        } else {
            this.reserved[labID] = {amount: amount, resourceType: rt};
        }
        return OK;
    },

    getReserved: function (labID) {
        return this.reserved[labID] || {amount: 0};
    },
*/
    addRequest: function (roomName, rt, amount = LAB_REQUEST_AMOUNT, type = LAB_REQUEST_TYPE_TERMINAL, chainID) {
        if (!roomName || !rt) {
            console.log(`minerals.addRequest: no roomName (${roomName}) or rt (${rt})`);
            return null;
        }
        let reqID = _.ceil(Math.random() * 1000000);
        if (reqID in Memory.labRequests) {
            console.log(`minerals.addRequest: req_id (${reqID}) already exists`);
            return null;
        }

        let inputTypes = global.cache.minerals.getInputTypes(rt);
        if (inputTypes.length != 2) {
            console.log(`minerals.addRequest: length input rt for ${rt} = ${inputTypes.length}`);
            return null;
        }

        Memory.labRequests[reqID] = {
            id: reqID,
            chainID,
            roomName,
            type,
            outputType: rt,
            amount,
            reacted: 0,
            startTime: 0,
            inputType1: inputTypes[0],
            inputType2: inputTypes[1],
            stage: LAB_REQUEST_STAGE_CREATED,
            createTime: Game.time,
        };

        console.log("minerals.addRequest: ADDED: " + JSON.stringify(Memory.labRequests[reqID]));

        return reqID;
    },

    badRequest: function (reqID) {
        let request = Memory.labRequests[reqID];
        if (!request)
            return OK;

        request.stage = LAB_REQUEST_STAGE_CREATED;

        return OK;
    }
};

module.exports = queue;
profiler.registerObject(queue, 'queueLab');