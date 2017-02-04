var utils = require('utils');

var role = {
    run: function(creep) {
        if(!creep.memory.energyName || !Game.flags[creep.memory.energyName]) {
            if(!set_energy(creep)) 
                return;
        }

        let hostiles = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 4, {filter: c => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK)});
        if (hostiles.length) {
            let target = hostiles.sort(function(a,b){ return creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b) || a.hits - b.hits;})[0];
            if (creep.attack(target) == ERR_NOT_IN_RANGE)
                creep.moveTo(target);
            return;
        } else {
            if(creep.carry.energy == 0 && creep.memory.transfering) {
                creep.memory.transfering = false;
            } else if (creep.carry.energy == creep.carryCapacity && !creep.memory.transfering) {
                creep.memory.transfering = true;
                delete creep.memory.cID;
                creep.memory.energyID = null;
            }
        }
        
        if(!creep.memory.transfering) {
	        if(creep.room.name == Game.flags[creep.memory.energyName].pos.roomName) {
	            let attack_res = utils.try_attack(creep);
	            if(!attack_res) {
	                creep.memory.transfering = true;
	            } else if (attack_res == 1) {
	                ;
	            } else {
                    utils.findSourceAndGo(creep);
	            }
	        } else {
                creep.moveTo(Game.flags[creep.memory.energyName].pos);
                //console.log(creep.name + " going to " + creep.memory.energyName + " to " + exitDir);
	        }
        } else {
            if (creep.room.name != Game.spawns[creep.memory.spawnName].room.name) {
                creep.moveTo(Game.spawns[creep.memory.spawnName]);
                return;
            }

            if(creep.memory.cID === undefined)
                set_cid(creep);
        
            let container = Game.getObjectById(creep.memory.cID);
            if(!container) {
                console.log("Problem getting container for " + creep.name);
                delete creep.memory.cID;
                return;
            }

            if(creep.room.name == container.pos.roomName) {
                let res = creep.transfer(container, RESOURCE_ENERGY);
                if(res == ERR_NOT_IN_RANGE) {
                    let res = creep.moveTo(container);
                } else if (res == ERR_FULL) {
                    //console.log(creep.name + " container is full");
                    set_cid(creep);
                    return;
                }
            } else {
                creep.moveTo(container.pos);
            }
        }
	},
	
    create: function(energy, worker) {
	    energy -= 80*2 + 50*1; // For move-attack parts
        let body = [];
	    let cnum = 0;
	    let fat = 0;
	    while (energy >= 50 && body.length < 47) {
            if(fat >= 0 && energy >= 50) {
	            body.push(MOVE);
	            energy -= 50;
	            fat -= 2;
	        }
	        if(cnum % 2 == 0 && energy >= 100 && worker && body.length < 47) {
	            body.push(WORK);
	            energy -= 100;
	            fat++;
	        }
	        if(fat >= 0 && energy >= 50 && body.length < 47) {
	            body.push(MOVE);
	            energy -= 50;
	            fat -= 2;
	        }
	        if(energy >= 50 && body.length < 47) {
	            body.push(CARRY);
	            energy -= 50;
	            cnum++;
	            fat++;
	        }
	    }
        body.push(MOVE,ATTACK,ATTACK);
	    return [body, energy];
	},
};

function set_cid (creep) {
    //console.log("Searching container for " + creep.name);
    if(creep.room.storage) {
        let links = creep.room.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_LINK && s.pos.getRangeTo(creep.room.storage) > 3});
        creep.memory.cID = creep.pos.findClosestByPath(links.concat(creep.room.storage), {ignoreCreeps: true, filter: s => 
            (s.storeCapacity ? s.storeCapacity - s.store[RESOURCE_ENERGY] : s.energyCapacity - s.energy) > 0
        }).id;
        return;
    }
    let containers = creep.room.find(FIND_STRUCTURES, { filter: s => s.structureType == STRUCTURE_CONTAINER });
    if(!containers.length) {
        console.log(creep.name + " no containers in room, nothing to do");
        return;
    }
    creep.memory.cID = containers.sort( function(a,b) { return a.store[RESOURCE_ENERGY] - b.store[RESOURCE_ENERGY]; })[0].id;
    //console.log(creep.name + " container=" + creep.memory.cID);
}

function set_energy (creep) {
    let sources = _.filter(Game.flags, f => f.name.substring(0, 6) == 'Source' && f.pos.roomName == creep.memory.roomName);
    if(!sources.length) {
        console.log(creep.name + " found no flags");
        return;
    }
    //console.log(creep.name + " sources: " + sources);
    
    creep.memory.energyName = sources.sort( function(a,b) { 
        let suma = _.sum(Game.creeps, (c) => c.memory.role == "longharvester" && c.memory.energyName == a.name);// + Game.map.getRoomLinearDistance(a.pos.roomName, creep.memory.roomName);
        let sumb = _.sum(Game.creeps, (c) => c.memory.role == "longharvester" && c.memory.energyName == b.name);// + Game.map.getRoomLinearDistance(b.pos.roomName, creep.memory.roomName);
        //console.log("a=" + a.id + ",b=" + b.id + ",suma=" + suma + ",sumb=" + sumb);
        return suma - sumb;
    })[0].name;
    //console.log(creep.name + " energyName=" + creep.memory.energyName);
}

module.exports = role;