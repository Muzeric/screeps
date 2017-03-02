var utils = require('utils');
const profiler = require('screeps-profiler');

var role = {
    run: function(creep) {
        if (!utils.checkInRoomAndGo(creep))
            return;

        if(creep.carry.energy == 0 && creep.memory.transfering) {
	        creep.memory.transfering = false;
            creep.memory.targetID = null;
	    } else if (creep.carry.energy == creep.carryCapacity && !creep.memory.transfering) {
	        creep.memory.transfering = true;
	        creep.memory.errors = 0;
	        creep.memory.energyID = null;
	    }
	    
	    if(!creep.memory.transfering) {
            creep.memory.needRepair = 0;
            creep.findSourceAndGo();
        } else {
            /*
            if (creep.ticksToLive < 500)
                creep.memory.needRepair = 1;
            else if (creep.ticksToLive > 1200)
                creep.memory.needRepair = 0;

            if (creep.memory.needRepair) {
                let spawns = creep.room.find(FIND_MY_SPAWNS);
                if (!spawns.length) {
                    console.log(creep.name + ": needRepair, but no spawns in room");
                    return;
                }
                let spawn = spawns.sort(function(a,b) {return (a.spawning ? a.spawning.remainingTime : 0) - (b.spawning ? b.spawning.remainingTime : 0);})[0];
                if (spawn.energy < spawn.energyCapacity)
                    creep.transfer(spawn, RESOURCE_ENERGY);
                if(spawn.renewCreep(creep) == ERR_NOT_IN_RANGE)
                    creep.moveTo(spawn);
                return;
            }
            */

            if (!creep.memory.targetID)
                setTarget(creep);
            let target = Game.getObjectById(creep.memory.targetID);
            if(!target) {
                console.log(creep.name + ": target "+ creep.memory.targetID +" dead");
                creep.memory.targetID = null;
                return;
            }

            if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                var res = creep.moveTo(target);
                //console.log(creep.name + " go to "+ target.pos.x + "," + target.pos.y +" res=" + res);
                if(res == ERR_NO_PATH) {
                    creep.memory.errors++;
                } else if (res == OK) {
                    creep.memory.errors = 0;
                }
            }
        }
	},
	
	create: function(energy, worker) {
	    let energyDiff = 0;
        if (energy > 1350) {
            energyDiff = energy - 1350;
            energy = 1350;
        }
        let body = [];
        let fat = 0;
        let mnum = 0;
        let wnum = 0;
	    while (energy >= 50 && body.length < 50) {
	        if((!mnum || fat/(mnum*2) >= 1) && energy >= 50) {
	            body.push(MOVE);
	            energy -= 50;
                mnum++;
	        }
	        if(energy >= 50 && body.length < 50) {
	            body.push(CARRY);
	            energy -= 50;
	            fat++;
	        }
            if((worker || !wnum) && energy >= 100 && body.length < 50) {
	            body.push(WORK);
	            energy -= 100;
	            fat++;
                wnum++;
	        }
	    }
	    energy += energyDiff;
	    return [body, energy];
	},
};

function setTarget (creep) {
    creep.memory.targetID = null;
    let targets = _.filter(
        (creep.room.memory.structures[STRUCTURE_EXTENSION] || []).concat( 
        (creep.room.memory.structures[STRUCTURE_LAB] || []), 
        (creep.room.memory.structures[STRUCTURE_TOWER] || []),
        (creep.room.memory.structures[STRUCTURE_SPAWN] || []),
        (creep.room.memory.structures[STRUCTURE_STORAGE] || []) ),
    t => t.energy < t.energyCapacity);

    if (!targets.length) {
        //console.log(creep.name + ": no any container for energy");
        return;
    }

    let minTarget;
    let minCost;
    for(let target of targets) {
        let wantEnergy = target.energyCapacity - target.energy;
        let cpath = creep.pos.getRangeTo(target.pos.x, target.pos.y);
        let wantCarry = global.cache.wantCarry[creep.room.name] ? global.cache.wantCarry[creep.room.name][target.id] || 0 : 0;
        let cpriority = 0;
        if (wantCarry >= wantEnergy)
            cpriority = -100;
        else if (target.structureType == STRUCTURE_STORAGE)
            cpriority = -50;
        else if (target.structureType == STRUCTURE_TOWER && target.energy < target.energyCapacity * 0.9)
            cpriority = 100;
        else if (target.structureType == STRUCTURE_TOWER && target.energy > target.energyCapacity * 0.9)
            cpriority = -30;

        let cost = cpath * 1.2 - cpriority;
        if (minCost === undefined || cost < minCost) {
            minTarget = target;
            minCost = cost;
        }
        if (creep.name == "harvester.0.56")
            console.log(creep.name + " [" + creep.room.name + "] has target " + target.id + " in " + cpath + " with " + wantCarry + " wantCarry and " + wantEnergy + " wanted and cpriotiy=" + cpriority + " cost=" + cost + ", targetID=" + minTarget.id);
    }
    creep.memory.targetID = minTarget.id;
}

module.exports = role;
profiler.registerObject(role, 'roleHarvester');