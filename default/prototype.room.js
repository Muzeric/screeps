const profiler = require('screeps-profiler');
var utils = require('utils');
var travel = require('travel');

var roomsHelper = {
    fakeUpdate: function (roomName) {
        let lastCPU = Game.cpu.getUsed();
        let res;
        if (Game.rooms[roomName]) {
            try {
                res = Game.rooms[roomName].update();
            } catch (e) {
                console.log(roomName + " ROOMUPDATE ERROR: " + e.toString() + " => " + e.stack);
                Game.notify(roomName + " ROOMUPDATE ERROR: " + e.toString() + " => " + e.stack);
            }
        } else if (!(roomName in Memory.rooms)) {
            res = ERR_NOT_FOUND;
        } else {
            let memory = Memory.rooms[roomName];
            if ("costMatrix" in memory) {
                global.cache.matrix[roomName] = global.cache.matrix[roomName] || {};
                global.cache.matrix[roomName]["common"] = PathFinder.CostMatrix.deserialize(memory.costMatrix);
                global.cache.matrix[roomName]["withCreeps"] = global.cache.matrix[roomName]["common"];
            }
            memory.hostilesCount = memory.hostilesCount && memory.hostilesDeadTime - Game.time > 0 ? memory.hostilesCount : 0;
            res = OK;
        }
        global.cache.stat.updateRoom(roomName, 'cpu', Game.cpu.getUsed() - lastCPU);
        return res;
    },

    fakeUpdate2: function (roomName) {
        let lastCPU = Game.cpu.getUsed();
        let res;
        if (Game.rooms[roomName]) {
            try {
                res = Game.rooms[roomName].update2();
            } catch (e) {
                console.log(roomName + " ROOMUPDATE2 ERROR: " + e.toString() + " => " + e.stack);
                Game.notify(roomName + " ROOMUPDATE2 ERROR: " + e.toString() + " => " + e.stack);
            }
        }
        global.cache.stat.updateRoom(roomName, 'cpu', Game.cpu.getUsed() - lastCPU);
        return res;
    },

    getHostilesCount: function (roomName, timeout = HOSTILES_DEAD_TIMEOUT) {
        if (!(roomName in Memory.rooms))
            return null;

        let memory = Memory.rooms[roomName];
        return memory.hostilesCount && memory.hostilesDeadTime - Game.time > timeout ? memory.hostilesCount : 0;
    },
    
};

module.exports = roomsHelper;
profiler.registerObject(roomsHelper, 'roomsHelper');

Room.prototype.update = function() {
    global.cache.matrix[this.name] = {};
    global.cache.wantCarry[this.name] = {};
    global.cache.creeps[this.name] = {};

    if (!("pathCache" in this.memory) || Game.time - (this.memory.pathCacheTime || 0) >= UPDATE_INTERVAL_PATHCACHE)
        this.updatePathCache();
    if (!("structures" in this.memory) || Game.time - (this.memory.structuresTime || 0) >= UPDATE_INTERVAL_STRUCTURES)
        this.updateStructures();
    this.updateCreeps();
    if (!("resources" in this.memory) || Game.time - (this.memory.resourcesTime || 0) >= UPDATE_INTERVAL_RESOURCES)
        this.updateResources();
    
    /*
    for (let key of _.filter(Object.keys(this.memory.needRoads), r => this.memory.needRoads[r].wanted > ROADS_REPAIR_WANTED)) {
        let color = 'green';
        if (this.memory.needRoads[key].wanted > ROADS_CONSTRUCT_WANTED)
            color = 'red';
        else if (this.memory.needRoads[key].wanted > 10)
            color = 'yellow';
            
        let pos = key.split(',');
        
        this.visual.circle(parseInt(pos[0]), parseInt(pos[1]), {fill: color});
    }
    */

    return OK;
}

Room.prototype.update2 = function() {
    if (!("pathToRoomsTime" in this.memory) || Game.time - (this.memory.pathToRoomsTime || 0) >= UPDATE_INTERVAL_PATHCACHE)
        this.updatePathToRooms();

    return OK;
}

Room.prototype.getPathToRoom = function (roomName) {
    let memory = this.memory;
    return memory.pathToRooms[roomName];
}

Room.prototype.updatePathToRooms = function () {
    let memory = this.memory;
    memory.pathToRooms = {};
    for (let roomName of global.cache.roomNames) {
        if (roomName == this.name)
            continue;
        memory.pathToRooms[roomName] = travel.getRoomsAvgPathLength(memory.pathCache, roomName);
        if (!memory.pathToRooms[roomName]) {
            if (Memory.rooms[roomName] && Memory.rooms[roomName].pointPos && memory.pointPos) {
                let ps = memory.pointPos;
                let pt = Memory.rooms[roomName].pointPos;
                let path = travel.getPath(new RoomPosition(ps.x, ps.y, ps.roomName), {pos: new RoomPosition(pt.x, pt.y, pt.roomName), range: 2}, null, 0, null, PATH_OPS_LIMIT_LONG * 2);
                if (path.path.length && !path.incomplete)
                    memory.pathToRooms[roomName] = path.path.length;
            } else {
                memory.pathToRooms[roomName] = Game.map.getRoomLinearDistance(this.name, roomName) * 50 || null;
            }
        }
    }

    memory.pathToRoomsTime = Game.time;
}

Room.prototype.updatePathCache = function() {
    let memory = this.memory;
    memory.pathCache = memory.pathCache || {};
    memory.pathCount = travel.clearPathCache(memory.pathCache);
    //console.log(this.name + ": updatePathCache: " + allCount + " paths, " + delCount + " deleted");
    memory.pathCacheTime = Game.time;
}

Room.prototype.getAmount = function (rt) {
    return this.memory.store[rt] || 0;
}

Room.prototype.canBuildContainers = function () {
    let memory = this.memory;
    if (memory.type == "my" && memory.structures[STRUCTURE_SPAWN] || 
        memory.type == "reserved" && (global.cache.creeps[this.name].mine["longharvester"] || []).length > 1
    )
        return 1;
    
    return 0;
}

Room.prototype.updateResources = function() {
    let memory = this.memory;
    memory.resources = [];
    memory.energy = 0;
    memory.freeEnergy = 0;
    memory.store = {};

    this.find(FIND_DROPPED_ENERGY).forEach( function(r) {
        let elem = {
            id : r.id,
            pos : r.pos,
            amount : r.amount,
            energy : r.resourceType == RESOURCE_ENERGY ? r.amount : 0,
            resourceType : r.resourceType,
        };
        memory.resources.push(elem);
    });

    for ( let elem of _.filter(_.flatten(_.values(memory.structures)), s => "energy" in s || "store" in s) )  {
        let s = Game.getObjectById(elem.id);
        if (!s) {
            console.log(this.name + ": no resource object " + elem.id);
            elem.energy = 0;
            continue;
        }
        elem.energy = "energy" in s ? s.energy : ("store" in s ? s.store[RESOURCE_ENERGY] : 0);
        memory.energy += elem.energy;
        if ([STRUCTURE_CONTAINER, STRUCTURE_STORAGE].indexOf(s.structureType) !== -1)
            memory.freeEnergy += elem.energy;
        if ("store" in s) {
            elem.store = _.clone(s.store);
            for (let rt in s.store)
                memory.store[rt] = (memory.store[rt] || 0) + s.store[rt];
        }
        if (elem.structureType == STRUCTURE_SOURCE && s.ticksToRegeneration == 1) {
            global.cache.stat.updateRoom(this.name, 'lost', elem.energy);
        } else if (elem.structureType == STRUCTURE_LAB) {
            elem.mineralType = s.mineralType;
            elem.mineralAmount = s.mineralAmount;
            elem.cooldown = s.cooldown;
            if (s.mineralType)
                memory.store[s.mineralType] = (memory.store[s.mineralType] || 0) + s.mineralAmount;
        } else if (elem.structureType == STRUCTURE_POWER_SPAWN) {
            elem.power = s.power;
        }
    }
    memory.resourcesTime = Game.time;
}

Room.prototype.getNearComingLairPos = function(pos, range, leftTime) {
    let lair = _.filter( this.memory.structures['keeperLair'], s => _.inRange(this.memory.structuresTime + s.ticksToSpawn - Game.time, 1, leftTime || KEEPLAIR_LEAVE_TIME) && pos.inRangeTo(s.pos, range) )[0];
    return lair ? lair.pos : null;
}

Room.prototype.needRoad = function(creep) {
    let roads = this.memory.needRoads;
    let key = creep.pos.x + "," + creep.pos.y;
    
    if (creep.memory.role == 'harvester' || creep.memory.role == 'longharvester' || creep.memory.role == 'upgrader') {
        if (!(key in roads)) {
            roads[key] = {wanted : 1, lastUpdate : Game.time, needRepair : 0, id : null};
        } else {
            roads[key].wanted = Game.time - roads[key].lastUpdate < ROADS_TIMEOUT ? roads[key].wanted + 1 : 1;
            roads[key].lastUpdate = Game.time;
        }
    }

    if (roads[key] && roads[key].needRepair && roads[key].id && creep.carry.energy && creep.getActiveBodyparts(WORK)) {
        let road = Game.getObjectById(roads[key].id);
        if (!road) {
            roads[key].id = null;
            return -1;
        }
        if (road.hits && road.hits < road.hitsMax) {
            //console.log(creep.name + ": repair road on " + key);
            creep.repair(road);
        } else if (road.progressTotal) {
            //console.log(creep.name + ": build road on " + key);
            creep.build(road);
        }
        return 0;
    }

    return 0;
}

Room.prototype.refreshRoad = function (memory, s) {
    let key = s.pos.x + "," + s.pos.y;
    if (memory.needRoads[key]) {
        memory.needRoads[key].id = s.id;
        if (Game.time - (memory.needRoads[key].lastUpdate || 0) > ROADS_TIMEOUT) {
            delete memory.needRoads[key];
            return -1;
        }

        if (memory.needRoads[key].wanted > ROADS_REPAIR_WANTED && (s.progressTotal || s.hits && s.hits < s.hitsMax * 0.9))
            memory.needRoads[key].needRepair = 1;
        else
            memory.needRoads[key].needRepair = 0;
        
        return 0;
    }

    return -2;
}

Room.prototype.linkAction = function () {
    let link_to = this.getStoragedLink();
    if (!link_to)
        return ERR_NOT_FOUND;

    for (let link_from of this.getUnStoragedLinks()) {
        let space = link_to.energyCapacity - link_to.energy;
        if (link_from && !link_from.cooldown && link_from.energy && link_from.energy <= space) {
            space -= link_from.energy;
            link_from.transferEnergy(link_to);
        }
    }

    return OK;
}

Room.prototype.getStoragedLink = function() {
    let link = _.filter(this.memory.structures[STRUCTURE_LINK], l => l.storaged)[0];
    if (link)
        return Game.getObjectById(link.id);
    
    return null;
}

Room.prototype.getUnStoragedLinks = function() {
    return _.map( _.filter(this.memory.structures[STRUCTURE_LINK], l => !l.storaged), l => Game.getObjectById(l.id));
}

Room.prototype.getTowers = function() {
    return _.map( this.memory.structures[STRUCTURE_TOWER], t => Game.getObjectById(t.id) );
}

Room.prototype.getPairedContainer = function(pos) {
    let containers = _.filter( [].concat(
        (this.memory.structures[STRUCTURE_CONTAINER] || []),
        (this.memory.structures[STRUCTURE_LINK] || []),
        (this.memory.structures[STRUCTURE_STORAGE] || [])
    ), c => c.source && c.betweenPos);

     if (!containers.length)
        return null;
    
    let resultContainer;
    let minTicks;
    let minRange;
    for (let container of containers) {
        let ticks = _.sum(_.filter(Game.creeps, c => c.memory.cID == container.id && (c.memory.role == "longminer" || c.memory.role == "miner")), c => c.ticksToLive);
        let range = 0;
        if (pos) {
            let cPos = new RoomPosition(container.pos.x, container.pos.y, container.pos.roomName);
            range = cPos.getRangeTo(pos);
        }
        if (minTicks === undefined || ticks < minTicks || (ticks == minTicks && range < minRange)) {
            resultContainer = container;
            minTicks = ticks;
            minRange = range;
        }
    }

    return resultContainer;
}

Room.prototype.getPairedExtractor = function(withAmount) {
    if (STRUCTURE_EXTRACTOR in this.memory.structures 
        && this.memory.structures[STRUCTURE_EXTRACTOR].length
        && (this.memory.structures[STRUCTURE_EXTRACTOR][0].cID || this.memory.structures[STRUCTURE_EXTRACTOR][0].buildContainerID)
        && (!withAmount || this.memory.structures[STRUCTURE_EXTRACTOR][0].mineralAmount > 0)
    )
        return this.memory.structures[STRUCTURE_EXTRACTOR][0];
    return null;
}

Room.prototype.getLabs = function () {
    return this.memory.structures[STRUCTURE_LAB] || [];
}

Room.prototype.getRepairLimit = function () {
    return this.storage && this.storage.store.energy > REPAIR_ENERGY_LIMIT ? REPAIR_LIMIT_HIGH : REPAIR_LIMIT;
}

Room.prototype.getConstructions = function () {
    return _.filter( this.memory.structures[FIND_MY_CONSTRUCTION_SITES] || [], s => !s.finished);
}

Room.prototype.getRepairs = function () {
    return _.filter( _.flatten(_.values(this.memory.structures)), s => !s.finished && s.hits < s.hitsMax*0.9 && s.hits < this.getRepairLimit() );
}

Room.prototype.finishBuildRepair = function (targetID) {
    for (let key in this.memory.structures) {
        for (let i = 0; i < this.memory.structures[key].length; i++) {
            let s = this.memory.structures[key][i];
            if (s.id == targetID) {
                s.finished = 1;
                if (s.structureType == FIND_MY_CONSTRUCTION_SITES)
                    this.memory.structuresTime = 0;
                return;
            }
        }
    }
}

Room.prototype.updateStructures = function() {
    console.log(this.name + ": updateStructures");
    let room = this;
    let memory = this.memory;
    memory.structures = {};
    memory.type = 'other';
    memory.constructions = 0;
    memory.constructionHits = 0;
    memory.constructionsRoads = 0;
    memory.repairs = 0;
    memory.repairHits = 0;
    if (!("needRoads" in memory))
        memory.needRoads = {};
    memory.pointPos = Game.flags["PointPos." + this.name] ? Game.flags["PointPos." + this.name].pos : null;
    let costs = new PathFinder.CostMatrix;
        
    this.find(FIND_SOURCES).forEach( function(s) {
        let elem = {
                id : s.id,
                pos : s.pos,
                energy : s.energy,
                energyCapacity : s.energyCapacity,
                minersFrom : _.some(Game.creeps, c => (c.memory.role == "longminer" || c.memory.role == "miner") && c.memory.energyID == s.id),
                structureType : STRUCTURE_SOURCE,
                places : utils.getRangedPlaces(null, s.pos, 1).length,
                rangedPlaces : utils.getRangedPlaces(null, s.pos, 1),
        };
        memory.structures[STRUCTURE_SOURCE] = memory.structures[STRUCTURE_SOURCE] || [];
        memory.structures[STRUCTURE_SOURCE].push(elem);
    });

    for (let key of _.filter(Object.keys(memory.needRoads), r => memory.needRoads[r].id ))
        memory.needRoads[key].id = null; // Renew id's, if hostile or manual removed object

    this.find(FIND_STRUCTURES).forEach( function(s) {
        let elem;
        if (s.structureType == STRUCTURE_KEEPER_LAIR) {
            memory.type = 'lair';
            elem = {
                ticksToSpawn : s.ticksToSpawn,
            };
            if (!memory.pointPos)
                memory.pointPos = s.pos;
        } else if (s.structureType == STRUCTURE_CONTROLLER) {
            if (s.my) {
                memory.type = 'my';
            } else if (s.reservation && s.reservation.username == 'Saint') {
                memory.type = 'reserved';
                memory.reserveEnd = Game.time + s.reservation.ticksToEnd;
            } else if (s.reservation || s.owner) {
                memory.type = 'hostiled';
            } else {
                memory.type = 'empty';
            }
            if (!memory.pointPos)
                memory.pointPos = s.pos;
            elem = {
                structureType : s.structureType,
                rangedPlaces : utils.getRangedPlaces(null, s.pos, 1),
            };
        } else if (s.structureType == STRUCTURE_ROAD) {
            costs.set(s.pos.x, s.pos.y, 1);
            room.refreshRoad(memory, s);
        } else if ([STRUCTURE_CONTAINER, STRUCTURE_STORAGE, STRUCTURE_LINK, STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_POWER_SPAWN, STRUCTURE_LAB, STRUCTURE_EXTRACTOR, STRUCTURE_TERMINAL, STRUCTURE_NUKER].indexOf(s.structureType) !== -1) {
            elem = {
                structureType : s.structureType,
                places : utils.getRangedPlaces(null, s.pos, 1).length,
                hits : s.hits,
                hitsMax : s.hitsMax, 
            };

            if ("energy" in s) {
                elem.energy = s.energy;
            } else if ("store" in s) {
                elem.energy = s.store[RESOURCE_ENERGY];
                elem.store = _.clone(s.store);
            }
            
            if ("energyCapacity" in s)
                elem.energyCapacity = s.energyCapacity;
            else if ("storeCapacity" in s)
                elem.energyCapacity = s.storeCapacity;

            if ([STRUCTURE_CONTAINER, STRUCTURE_STORAGE, STRUCTURE_LINK].indexOf(s.structureType) !== -1) {
                elem.minersTo = _.some(Game.creeps, c => (c.memory.role == "longminer" || c.memory.role == "miner" || c.memory.role == "shortminer") && c.memory.cID == s.id);
                elem.source = _.filter(memory.structures[STRUCTURE_SOURCE], sr => s.pos.inRangeTo(sr.pos, 2))[0];
                if (elem.source) {
                    if (s.structureType == STRUCTURE_CONTAINER && s.pos.isNearTo(elem.source.pos))
                        elem.betweenPos = s.pos;
                    else
                        elem.betweenPos = _.filter( utils.getRangedPlaces(null, elem.source.pos, 1), p => p.isNearTo(s.pos) )[0];
                    if (elem.betweenPos)
                        elem.source.pair = (elem.source.pair || 0) + 1;
                }
            }

            if (s.structureType == STRUCTURE_LINK) {
                elem.minersFrom = _.some(Game.creeps, c => (c.memory.role == "longminer" || c.memory.role == "miner" || c.memory.role == "shortminer") && c.memory.energyID == s.id);
                if (room.storage && s.pos.inRangeTo(room.storage.pos, 2))
                    elem.storaged = 1;
            } else if (s.structureType == STRUCTURE_EXTRACTOR) {
                elem.rangedPlaces = utils.getRangedPlaces(null, s.pos, 1);
                let mineral = s.pos.lookFor(LOOK_MINERALS)[0];
                if (!mineral) {
                    console.log(room.name + ": no mineral under extractor");
                } else {
                    elem.mineralID = mineral.id;
                    elem.mineralType = mineral.mineralType;
                    elem.mineralAmount = mineral.mineralAmount;
                }
            } else if (s.structureType == STRUCTURE_LAB) {
                elem.mineralCapacity = s.mineralCapacity;
            } else if (s.structureType == STRUCTURE_POWER_SPAWN) {
                elem.powerCapacity = s.powerCapacity;
            }

            if (s.structureType != STRUCTURE_CONTAINER)
                costs.set(s.pos.x, s.pos.y, 0xff);
            
        } else if ([STRUCTURE_WALL, STRUCTURE_RAMPART].indexOf(s.structureType) !== -1) {
            if (s.hits < s.hitsMax*0.9 && s.hits < room.getRepairLimit() ) {
                elem = {
                    hits : s.hits,
                    hitsMax : s.hitsMax, 
                }
            }

            if ((s.structureType != STRUCTURE_RAMPART || !s.my))
                costs.set(s.pos.x, s.pos.y, 0xff);
        } else if (s.structureType == STRUCTURE_PORTAL) {
            memory.type = 'portal';
            costs.set(s.pos.x, s.pos.y, 0xff);
        } else {
            costs.set(s.pos.x, s.pos.y, 0xff);
        }

        if (elem) {
            elem.id = s.id;
            elem.pos = s.pos;
            elem.structureType = s.structureType;
            memory.structures[s.structureType] = memory.structures[s.structureType] || [];
            memory.structures[s.structureType].push(elem);
            if (elem.hits < elem.hitsMax * 0.9 && elem.hits < room.getRepairLimit()) {
                memory.repairs++;
                memory.repairHits += _.min([elem.hitsMax * 0.9, room.getRepairLimit()]) - elem.hits;
            }
        }
    });

    let constructionsContainers = {};
    this.find(FIND_MY_CONSTRUCTION_SITES).forEach( function(s) {
        memory.constructions++;
        if (s.structureType == STRUCTURE_ROAD) {
            if( room.refreshRoad(memory, s) < 0) {
                s.remove();
                return;
            } else {
                memory.constructionsRoads++;
            }
        } else if ((s.structureType != STRUCTURE_RAMPART || !s.my) && s.structureType != STRUCTURE_CONTAINER) {
            costs.set(s.pos.x, s.pos.y, 0xff);
        } else if (s.structureType == STRUCTURE_CONTAINER) {
            constructionsContainers[s.pos.getKey()] = s.id;
        }
        let elem = {
            id: s.id,
            pos: s.pos,
            structureType: FIND_MY_CONSTRUCTION_SITES,
            constructionStructureType : s.structureType,
            progress : s.progress,
            progressTotal: s.progressTotal, 
        };
        memory.structures[FIND_MY_CONSTRUCTION_SITES] = memory.structures[FIND_MY_CONSTRUCTION_SITES] || [];
        memory.structures[FIND_MY_CONSTRUCTION_SITES].push(elem);
    });

    memory.costMatrix = costs.serialize();
    global.cache.matrix[this.name]["common"] = costs;

    for (let extractor of (memory.structures[STRUCTURE_EXTRACTOR] || [])) {
        let container = _.filter(memory.structures[STRUCTURE_CONTAINER], c => extractor.pos.inRangeTo(c.pos, 1))[0];
        if (container) {
            extractor.pair = 1;
            extractor.cID = container.id;
            extractor.betweenPos = container.pos;
        }
    }

    if (memory.type == 'my' || memory.type == 'lair' || memory.type == 'reserved') {
        for (let source of _.filter([].concat(memory.structures[STRUCTURE_SOURCE] || [], memory.structures[STRUCTURE_EXTRACTOR] || []), s => !s.pair && s.rangedPlaces.length)) {
            let contPos;
            let maxPlaces = 0;
            for (let pos of source.rangedPlaces) {
                let places = utils.getRangedPlaces(null, pos, 1).length;
                if (places > maxPlaces) {
                    contPos = pos;
                    maxPlaces = places;
                }
                
                if (constructionsContainers[pos.x + "x" + pos.y]) {
                    source.buildContainerID = constructionsContainers[pos.x + "x" + pos.y];
                    break;
                }
            }
            if (source.buildContainerID)
                continue;
            let res = this.createConstructionSite(contPos.x, contPos.y, STRUCTURE_CONTAINER);
            console.log(this.name + ": BUILT (" + res + ") container at " + contPos.x + "x" + contPos.y);
            if (res == OK)
                memory.constructions++;
        }
    }

    for (let key of _.filter(Object.keys(memory.needRoads), r => 
            !memory.needRoads[r].id && 
            (memory.needRoads[r].wanted > ROADS_CONSTRUCT_WANTED || Game.time - (memory.needRoads[r].lastUpdate || 0) > ROADS_TIMEOUT)
    )) {
        if (Game.time - (memory.needRoads[key].lastUpdate || 0) > ROADS_TIMEOUT) {
            delete memory.needRoads[key];
        } else if (memory.constructions < MAX_CONSTRUCTIONS_PER_ROOM) {
            let pos = key.split(',');
            if (pos[0] != 0 && pos[0] != 49 && pos[1] != 0 && pos[1] != 49) {
                let res = this.createConstructionSite(parseInt(pos[0]), parseInt(pos[1]), STRUCTURE_ROAD);
                console.log(this.name + " BUILT (" + res + ") road at " + key);
                memory.constructions++;
                memory.constructionsRoads++;
            }
        }
    }

    if (!memory.pointPos) {
        let flag = _.filter(Game.flags, f => f.pos.roomName == this.name)[0];
        if (flag)
            memory.pointPos = flag.pos;
    }

    memory.structuresTime = Game.time;
}

Room.prototype.getNearKeeperPos = function(pos, range) {
    return _.filter( global.cache.creeps[this.name].keepersPoses, p => pos.inRangeTo(p, range) )[0];
}

Room.prototype.getNearAttackers = function (pos, range = 5) {
    return _.filter( global.cache.creeps[this.name].hostileAttackers, c => pos.inRangeTo(c.pos, range) );
}

Room.prototype.getAllAttackers = function (pos, range = 5) {
    return _.filter( global.cache.creeps[this.name].hostileAttackers, c => pos.inRangeTo(c.pos, range) );
}

Room.prototype.updateCreeps = function() {
    let memory = this.memory;
    let roomName = this.name;
    memory.creepsTime = Game.time;
    global.cache.creeps[this.name] = {
        keepersPoses: [],
        hostileAttackers: [],
        hostileOther: [],
        mine: [],
    };
    let cache = global.cache.creeps[this.name];
    memory.hostilesCount = 0;
    memory.hostilesDeadTime = 0;
    if (!("common" in global.cache.matrix[this.name]))
        global.cache.matrix[this.name]["common"] = PathFinder.CostMatrix.deserialize(memory.costMatrix);
    let costs = global.cache.matrix[this.name]["common"].clone();

    this.find(FIND_CREEPS).forEach( function(c) {
        if (c.owner.username == "Source Keeper") {
            cache.keepersPoses.push(c.pos);
        } else if (!c.my && (1 || c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) || c.getActiveBodyparts(HEAL))) {
            cache.hostileAttackers.push(c);
            memory.hostilesCount++;
            if (Game.time + c.ticksToLive > memory.hostilesDeadTime)
                memory.hostilesDeadTime = Game.time + c.ticksToLive;
        } else if (c.my) {
            cache.mine[c.memory.role] = cache.mine[c.memory.role] || [];
            cache.mine[c.memory.role].push(c);
            if (c.memory.role == "harvester" && c.memory.targetID) {
                global.cache.wantCarry[roomName][c.memory.targetID] = (global.cache.wantCarry[roomName][c.memory.targetID] || 0) + c.carry.energy;
            } else if (c.memory.role == "attacker" || c.memory.role == "healer") {
                global.cache.creeps["_army"][c.memory.role + 's'] = global.cache.creeps["_army"][c.memory.role + 's'] || [];
                global.cache.creeps["_army"][c.memory.role + 's'].push(c);
            }
        } else  {
            cache.hostileOther.push(c);
        }
        costs.set(c.pos.x, c.pos.y, 0xff);
    });

    
    global.cache.matrix[this.name]["withCreeps"] = costs;
}
