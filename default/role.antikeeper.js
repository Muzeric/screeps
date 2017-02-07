var utils = require('utils');

var role = {

    run: function(creep) {
        let healed = 0;
        if (creep.hits < creep.hitsMax && creep.getActiveBodyparts(HEAL)) {
            creep.heal(creep);
            healed = 1;
        }
	    
        if (creep.room.name != creep.memory.roomName) {
            if (!Game.flags["Antikeeper." + creep.memory.roomName]) {
                console.log(creep.name + " no flag in " + creep.memory.roomName);
                return;
            }
            creep.moveTo(Game.flags["Antikeeper." + creep.memory.roomName]);
            return;
        }

        let target = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS);
        let moved = 0;
        let seeked;
        if (target) {
            let safePlace = creep.pos.findClosestByPath(utils.getRangedPlaces(creep, target.pos, 3));
            let hitsBefore = target.hits;
            let res = creep.rangedAttack(target);
            //console.log(creep.name + " attacked " + target.id + " ("+ target.hits +"/" + target.hitsMax + ") res=" + res);
            if (creep.moveTo(safePlace ? safePlace : target) == OK)
                moved = 1;
            //console.log(creep.name + " go to " + (safePlace ? safePlace : target));
        } else if (seeked = creep.pos.findInRange(FIND_MY_CREEPS, 11, {filter: c => c.hits < c.hitsMax && c != creep})[0] ) {
            if (creep.pos.isNearTo(seeked)) {
                if (!healed)
                    creep.heal(seeked);
            } else {
                if (!moved)
                    creep.moveTo(seeked);
                creep.rangedHeal(seeked);
            }
        } else {
            let lairs = creep.room.find(FIND_STRUCTURES, { filter : s => s.structureType == STRUCTURE_KEEPER_LAIR});
            if (!lairs.length) {
                console.log(creep.name + " no lairs in " + creep.room.name);
                return;
            }
            let lair = lairs.sort(function(a,b) {
                return a.ticksToSpawn - b.ticksToSpawn;
            })[0];

            if (creep.pos.getRangeTo(lair) > 3) {
                if (!moved)
                    creep.moveTo(lair);
                //console.log(creep.name + " go to lair " + lair.id);
            }
        }

	},
	
    create: function(energy) {
        let anum = 20;
        let hnum = 3;
        let mnum = anum + hnum;
        energy -= 150 * anum + 50 * mnum + 250 * hnum;
        
        let body = [];
        
        while (mnum-- > 0)
            body.push(MOVE);
        while (anum-- > 0)
            body.push(RANGED_ATTACK);
        while (hnum-- > 0)
            body.push(HEAL);
        
        return [body, energy];
	},
};

module.exports = role;