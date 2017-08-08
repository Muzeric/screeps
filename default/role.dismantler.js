var utils = require('utils');
const profiler = require('screeps-profiler');

var role = {
    run: function(creep) {
        let room = Game.rooms[creep.memory.roomName];
        if (!room)
            return null;
	    if(creep.memory.disming && creep.carry.energy == creep.carryCapacity) {
            creep.memory.disming = false;
            creep.memory.dismTargetID = null;
	    }
	    if(!creep.memory.disming && creep.carry.energy == 0) {
            creep.memory.targetID = null;
	        creep.memory.disming = true;
	    }

        if (creep.memory.disming) {
            let target;
            if (!creep.memory.dismTargetID) {
                let flags = _.filter(Game.flags, f => f.pos.roomName == creep.memory.roomName && f.name.substring(0, 9) == 'Dismantle');
                if (!flags.length)
                    return;
                let flag = flags.sort()[0];
                target = flag.pos.lookFor(LOOK_STRUCTURES)[0];
                if (!target) {
                    flag.remove();
                    return;
                }
                creep.memory.dismTargetID = target.id;
            } else {
                target = Game.getObjectById(creep.memory.dismTargetID);
                if (!target) {
                    creep.memory.dismTargetID = null;
                    return;
                }
            }

            if (creep.dismantle(target) == ERR_NOT_IN_RANGE)
                creep.moveTo(target);
        } else {
            let target = getTarget(creep);
            if(!target) {
                //console.log(creep.name + ": target "+ creep.memory.targetID +" dead");
                creep.memory.targetID = null;
                return;
            }

            if (creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE)
                creep.moveTo(target);
        }

	},
	
	create: function(energy) {
        let body = [];
	    while (energy >= 50 && body.length < 50) {
	        if(energy >= 50) {
	            body.push(MOVE);
	            energy -= 50;
	        }
	        if(energy >= 100 && body.length < 50) {
	            body.push(WORK);
	            energy -= 100;
	        }
	        if(energy >= 50 && body.length < 50) {
	            body.push(CARRY);
	            energy -= 50;
	        }
	    }
	    return [body, energy];
	},
};

function getTarget (creep) {
    let target = Game.getObjectById(creep.memory.targetID);
    
    if (!target || 
        (target.energyCapacity && target.energy == target.energyCapacity) ||                
        (target.storeCapacity && _.sum(target.store) == target.storeCapacity)
    ) {
        setTarget(creep);
    } else {
        return target;
    }
    target = Game.getObjectById(creep.memory.targetID);
    
    return target;
}

function setTarget (creep) {
    let memory = Memory.rooms[creep.memory.roomName];
    if (!memory) {
        console.log(creep.name + ": setTarget have no memory of " + creep.memory.roomName);
        return ERR_NOT_IN_RANGE;
    }

    creep.memory.targetID = null;
    let targets = _.filter(
        (memory.structures[STRUCTURE_EXTENSION] || []).concat( 
        (memory.structures[STRUCTURE_LAB] || []), 
        (memory.structures[STRUCTURE_TOWER] || []),
        (memory.structures[STRUCTURE_SPAWN] || []),
        (memory.structures[STRUCTURE_TERMINAL] || []),
        (memory.structures[STRUCTURE_STORAGE] || []),
        (memory.structures[STRUCTURE_NUKER] || []),
        (memory.structures[STRUCTURE_POWER_SPAWN] || [])
    ),
    t => t.energy < t.energyCapacity);

    if (!targets.length) {
        //console.log(creep.name + ": no any container for energy");
        return ERR_NOT_FOUND;
    }

    let minTarget;
    let minCost;
    for(let target of targets) {
        if (target.structureType == STRUCTURE_TERMINAL && target.energy > MIN_TERMINAL_ENERGY)
            continue;
        else if (target.structureType == STRUCTURE_NUKER && creep.room.memory.energy < REPAIR_ENERGY_LIMIT)
            continue;
        let wantEnergy = target.energyCapacity - target.energy;
        let cpath = creep.pos.getRangeTo(target.pos.x, target.pos.y);
        let wantCarry = global.cache.wantCarry[creep.room.name] ? global.cache.wantCarry[creep.room.name][target.id] || 0 : 0;
        let cpriority = 0;
        if (wantCarry >= wantEnergy)
            cpriority = -100;
        else if (target.structureType == STRUCTURE_STORAGE)
            cpriority = -100;
        else if (target.structureType == STRUCTURE_TOWER && target.energy < target.energyCapacity * 0.9)
            cpriority = 100;
        else if (target.structureType == STRUCTURE_TOWER && target.energy > target.energyCapacity * 0.9)
            cpriority = -30;
        else if (target.structureType == STRUCTURE_NUKER)
            cpriority = -49;

        let cost = cpath * 1.2 - cpriority;
        if (minCost === undefined || cost < minCost) {
            minTarget = target;
            minCost = cost;
        }
        //if (creep.name == "harvester.0.999")
        //   console.log(creep.name + " [" + creep.room.name + "] has target " + target.id + " in " + cpath + " with " + wantCarry + " wantCarry and " + wantEnergy + " wanted and cpriotiy=" + cpriority + " cost=" + cost + ", targetID=" + minTarget.id);
    }
    if (minTarget === undefined)
        return ERR_NOT_FOUND;
        
    creep.memory.targetID = minTarget.id;

    return OK;
}

module.exports = role;
profiler.registerObject(role, 'roleDismantler');