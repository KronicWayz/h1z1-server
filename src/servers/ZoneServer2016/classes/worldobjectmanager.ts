// ======================================================================
//
//   GNU GENERAL PUBLIC LICENSE
//   Version 3, 29 June 2007
//   copyright (C) 2020 - 2021 Quentin Gruber
//   copyright (C) 2021 - 2022 H1emu community
//
//   https://github.com/QuentinGruber/h1z1-server
//   https://www.npmjs.com/package/h1z1-server
//
//   Based on https://github.com/psemu/soe-network
// ======================================================================

import { ZoneServer2016 } from "../zoneserver";
const Z1_doors = require("../../../../data/2016/zoneData/Z1_doors.json");
const Z1_items = require("../../../../data/2016/zoneData/Z1_items.json");
const Z1_vehicles = require("../../../../data/2016/zoneData/Z1_vehicleLocations.json");
const Z1_npcs = require("../../../../data/2016/zoneData/Z1_npcs.json");
const models = require("../../../../data/2016/dataSources/Models.json");
import { _, generateRandomGuid, isPosInRadius } from "../../../utils/utils";
import { Vehicle2016 as Vehicle } from "./../classes/vehicle";
const debug = require("debug")("ZoneServer");

function getHeadActor(modelId: number): any {
  switch (modelId) {
    case 9510:
      return `ZombieFemale_Head_0${Math.floor(Math.random() * 2) + 1}.adr`;
    case 9634:
      return `ZombieMale_Head_0${Math.floor(Math.random() * 3) + 1}.adr`;
    default:
      return "";
  }
}

function getRandomVehicleId() {
  switch (Math.floor(Math.random() * 4)) {
    case 0: // offroader
      return 7225;
    case 1: // policecar
      return 9301;
    case 2: // pickup
      return 9258;
    case 3: // atv
      return 9588;
    default:
      // pickup
      return 9258;
  }
}

function getRandomItem(authorizedItems: Array<{ id: number; count: number }>) {
  return authorizedItems[Math.floor(Math.random() * authorizedItems.length)];
}

function getItemSpawnCount(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

export class WorldObjectManager {
  eItems: any = {
    WEAPON_AR15: 2425,
    AMMO_223: 1429,
    WEAPON_SHOTGUN: 2663,
    AMMO_12GA: 1511,
    WEAPON_CROWBAR: 82,
    WEAPON_COMBATKNIFE: 84,
    WEAPON_MACHETE01: 83,
    WEAPON_KATANA: 2961,
    WEAPON_BAT_WOOD: 1724,
    BACKPACK: 1605,
    GAS_CAN: 73,
    WEAPON_GUITAR: 1733,
    WEAPON_AXE_WOOD: 58,
    WEAPON_AXE_FIRE: 1745,
    WEAPON_HAMMER: 1536,
    WEAPON_HATCHET: 3,
    WEAPON_PIPE: 1448,
    WEAPON_BAT_ALUM: 1733,
    WEAPON_BOW_MAKESHIFT: 113,
    WEAPON_BOW_WOOD: 1720,
    WEAPON_BOW_RECURVE: 1986,
    WEAPON_45: 2,
    WEAPON_M9: 1997,
    AMMO_1911: 1428,
    AMMO_9MM: 1998, // TODO: assign it to a spawner
    WEAPON_308: 1899,
    AMMO_308: 1469,
    FIRST_AID: 2424,
    GROUND_COFFEE: 56, // TODO: expand with more canned food types
    CANNED_FOOD01: 7,
    WATER_PURE: 1371,
    HELMET_MOTORCYCLE: 2170, // TODO: expand with other default helmet colors
    HAT_CAP: 12, // TODO: expand with other cap colors
    SHIRT_DEFAULT: 92, // TODO: expand with other default shirts
    PANTS_DEFAULT: 86, // TODO: expand with other default pants

    HAT_BEANIE: 2162,
    SUGAR: 57,
    BATTERY: 1696,
    SPARKPLUGS: 1701,
    SALT: 22,
    LIGHTER: 1436,
    WATER_EMPTY: 1353,
    MRE_APPLE: 1402, // TODO: add other MRE types

    WEAPON_BINOCULARS: 1542,
    FUEL_BIOFUEL: 73,
    WOOD_PLANK: 109,
    METAL_SHEET: 46,
    METAL_SCRAP: 48,
    TARP: 155,
    WOOD_LOG: 16,
    FERTILIZER: 25,
    SEED_CORN: 1987,
    SEED_WHEAT: 1988,
    BANDAGE: 2423,
    VIAL_EMPTY: 2510,
    SYRINGE_EMPTY: 1508,
    WEAPON_CROSSBOW: 2246,
    WEAPON_R380: 1991,
    GHILLIE_SUIT: 92,
    HELMET_TACTICAL: 2172,
    RESPIRATOR: 2148,
    AMMO_380: 1992,
    AMMO_762: 2325,
    NV_GOGGLES: 1700,
    WEAPON_MOLOTOV: 14,
    WEAPON_MAGNUM: 1718,
    GUNPOWDER: 11,
    LANDMINE: 74,
    KEVLAR_DEFAULT: 2271,
    FLARE: 1672,
    CLOTH: 74,
    WEAPON_FLASHLIGHT: 1380,
    METAL_PIPE: 47,
    WEAPON_WRENCH: 1538,
    WEAPON_BRANCH: 1725,

    HEADLIGHTS_OFFROADER: 9,
    HEADLIGHTS_POLICE: 1730,
    HEADLIGHTS_ATV: 2194,
    HEADLIGHTS_PICKUP: 1728,

    TURBO_OFFROADER: 90,
    TURBO_POLICE: 1731,
    TURBO_ATV: 2195,
    TURBO_PICKUP: 1729,

    GRENADE_SMOKE: 2236,
    GRENADE_FLASH: 2235,
    GRENADE_GAS: 2237,
    GRENADE_HE: 2243,
  };
  _spawnedObjects: { [spawnerId: number]: string } = {};
  vehicleSpawnCap: number = 100;

  lastLootRespawnTime: number = 0;
  lastVehicleRespawnTime: number = 0;
  lastNpcRespawnTime: number = 0;
  lootRespawnTimer: number = 600000; // 10 minutes
  vehicleRespawnTimer: number = 600000; // 10 minutes // 600000
  npcRespawnTimer: number = 600000; // 10 minutes

  // objects won't spawn if another object is within this radius
  vehicleSpawnRadius: number = 50;
  npcSpawnRadius: number = 3;
  // only really used to check if another loot object is already spawned in the same exact spot
  lootSpawnRadius: number = 1;

  chancePumpShotgun: number = 50;
  chanceAR15: number = 50;
  chanceTools: number = 50;
  chancePistols: number = 100;
  chanceM24: number = 50;
  chanceConsumables: number = 50;
  chanceClothes: number = 50;
  chanceResidential: number = 30;
  chanceRare: number = 30;
  chanceIndustrial: number = 30;
  chanceWorld: number = 30;
  chanceLog: number = 30;
  chanceCommercial: number = 30;
  chanceFarm: number = 30;
  chanceHospital: number = 40;
  chanceMilitary: number = 30;

  chanceNpc: number = 50;
  chanceScreamer: number = 5; // 1000 max

  constructor() {}

  run(server: ZoneServer2016) {
    debug("WOM::Run");
    if (this.lastLootRespawnTime + this.lootRespawnTimer <= Date.now()) {
      this.createLoot(server);
      this.lastLootRespawnTime = Date.now();
    }
    if (this.lastNpcRespawnTime + this.npcRespawnTimer <= Date.now()) {
      this.createNpcs(server);
      this.lastNpcRespawnTime = Date.now();
    }
    if (this.lastVehicleRespawnTime + this.vehicleRespawnTimer <= Date.now()) {
      this.createVehicles(server);
      this.lastVehicleRespawnTime = Date.now();
    }
  }
  createEntity(
    // todo: clean this up
    server: ZoneServer2016,
    modelID: number,
    position: Array<number>,
    rotation: Array<number>,
    dictionary: any,
    itemSpawnerId: number = -1
  ): void {
    const guid = generateRandomGuid(),
      characterId = generateRandomGuid();
    dictionary[characterId] = {
      characterId: characterId,
      guid: guid,
      transientId: server.getTransientId(characterId),
      nameId: 0,
      modelId: modelID,
      position: position,
      rotation: rotation,
      headActor: getHeadActor(modelID),
      attachedObject: {},
      color: {},
      spawnerId: itemSpawnerId || 0,
    };
    if (itemSpawnerId) this._spawnedObjects[itemSpawnerId] = characterId;
  }

  createLootEntity(
    // todo: clean this up
    server: ZoneServer2016,
    itemDefinitionId: number,
    stackCount: number,
    position: Array<number>,
    rotation: Array<number>,
    itemSpawnerId: number = -1,
    itemGuid: string = ""
  ): void {
    const itemDef = server.getItemDefinition(itemDefinitionId);
    let modelId;
    if (!itemDef) {
      debug(
        `[ERROR] Tried to createLootEntity for invalid itemDefId: ${itemDefinitionId}`
      );
      return;
    }
    if (!itemDef.WORLD_MODEL_ID) {
      debug(
        `[ERROR] Tried to createLootEntity for itemDefId: ${itemDefinitionId} with no WORLD_MODEL_ID`
      );
      modelId = 9;
    } else {
      modelId = itemDef.WORLD_MODEL_ID;
    }
    const guid = generateRandomGuid(),
      characterId = generateRandomGuid();
    server._objects[characterId] = {
      characterId: characterId,
      guid: guid,
      transientId: server.getTransientId(characterId),
      modelId: modelId,
      position: position,
      rotation: rotation,
      spawnerId: itemSpawnerId || 0,
      itemGuid: itemGuid || server.generateItem(itemDefinitionId),
      stackCount: stackCount,
    };
    if (itemSpawnerId) this._spawnedObjects[itemSpawnerId] = characterId;
  }

  createDoors(server: ZoneServer2016): void {
    Z1_doors.forEach((doorType: any) => {
      const modelId: number = _.find(models, (model: any) => {
        return (
          model.MODEL_FILE_NAME ===
          doorType.actorDefinition.replace("_Placer", "")
        );
      })?.ID;
      doorType.instances.forEach((doorInstance: any) => {
        const r = doorInstance.rotation;
        this.createEntity(
          server,
          modelId ? modelId : 9183,
          doorInstance.position,
          [0, r[0] + -1.5707963705062866, 0],
          server._doors
        );
      });
    });
    debug("All door objects created");
  }

  createVehicles(server: ZoneServer2016) {
    if (Object.keys(server._vehicles).length >= this.vehicleSpawnCap) return;
    Z1_vehicles.forEach((vehicle: any) => {
      let spawn = true;
      _.forEach(server._vehicles, (spawnedVehicle: Vehicle) => {
        if (
          isPosInRadius(
            this.vehicleSpawnRadius,
            vehicle.position,
            spawnedVehicle.npcData.position
          )
        )
          spawn = false;
        return;
      });
      if (!spawn) return;
      const characterId = generateRandomGuid();
      const vehicleData = new Vehicle(
        server._worldId,
        characterId,
        server.getTransientId(characterId),
        getRandomVehicleId(),
        new Float32Array(vehicle.position),
        new Float32Array(vehicle.rotation),
        server.getGameTime()
      );
      server._vehicles[characterId] = vehicleData; // save vehicle
    });
    debug("All vehicles created");
  }

  createNpcs(server: ZoneServer2016) {
    // This is only for giving the world some life
    Z1_npcs.forEach((spawnerType: any) => {
      const authorizedModelId: number[] = [];
      switch (spawnerType.actorDefinition) {
        case "NPCSpawner_ZombieLazy.adr":
          authorizedModelId.push(9510);
          authorizedModelId.push(9634);
          break;
        case "NPCSpawner_ZombieWalker.adr":
          authorizedModelId.push(9510);
          authorizedModelId.push(9634);
          break;
        case "NPCSpawner_Deer001.adr":
          authorizedModelId.push(9002);
          break;
        default:
          break;
      }
      if (authorizedModelId.length) {
        let spawn = true;
        spawnerType.instances.forEach((npcInstance: any) => {
          _.forEach(server._npcs, (spawnedNpc: any) => {
            if (
              isPosInRadius(
                this.npcSpawnRadius,
                npcInstance.position,
                spawnedNpc.position
              )
            )
              spawn = false;
            return;
          });
          if (!spawn) return;
          const spawnchance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
          if (spawnchance <= this.chanceNpc) {
            const screamerChance = Math.floor(Math.random() * 1000) + 1; // temporary spawnchance
            if (screamerChance <= this.chanceScreamer) {
              authorizedModelId.push(9667);
            }
            const r = npcInstance.rotation;
            this.createEntity(
              server,
              authorizedModelId[
                Math.floor(Math.random() * authorizedModelId.length)
              ],
              npcInstance.position,
              [0, r[0], 0],
              server._npcs
            );
          }
        });
      }
    });
    debug("All npcs objects created");
  }

  createLoot(server: ZoneServer2016) {
    Z1_items.forEach((spawnerType: any) => {
      this.createAR15(server, spawnerType);
      this.createPumpShotgun(server, spawnerType);
      this.createTools(server, spawnerType);
      this.createPistols(server, spawnerType);
      this.createM24(server, spawnerType);
      this.createConsumables(server, spawnerType);
      this.createClothes(server, spawnerType);
      this.createResidential(server, spawnerType);
      this.createRare(server, spawnerType);
      this.createIndustrial(server, spawnerType);
      this.createWorld(server, spawnerType);
      this.createLog(server, spawnerType);
      this.createCommercial(server, spawnerType);
      this.createFarm(server, spawnerType);
      this.createHospital(server, spawnerType);
      this.createMilitary(server, spawnerType);
    });
    debug(
      `WOM: AR15 and ammo items objects created. Spawnrate: ${this.chanceAR15}%`
    );
    debug(
      `WOM: PumpShotgun and ammo items objects created. Spawnrate: ${this.chancePumpShotgun}%`
    );
    debug(`WOM: Tools items objects created. Spawnrate: ${this.chanceTools}%`);
    debug(
      `WOM: 1911, M9, 380 and ammo items objects created. Spawnrate: ${this.chancePistols}%`
    );
    debug(
      `WOM: 308Rifle and ammo items objects created. Spawnrate: ${this.chanceM24}%`
    );
    debug(
      `WOM: Consumable items objects created. Spawnrate: ${this.chanceConsumables}%`
    );
    debug(
      `WOM: Clothes items objects created. Spawnrate: ${this.chanceClothes}%`
    );
    debug(
      `WOM: Residential Areas items objects created. Spawnrate: ${this.chanceResidential}%`
    );
    debug(`WOM: Rare items objects created. Spawnrate: ${this.chanceRare}%`);
    debug(
      `WOM: Industrial Areas items objects created. Spawnrate: ${this.chanceIndustrial}%`
    );
    debug(
      `WOM: World Areas items objects created. Spawnrate: ${this.chanceWorld}%`
    );
    debug(
      `WOM: Log Areas items objects created. Spawnrate: ${this.chanceWorld}%`
    );
    debug(
      `WOM: Commercial Areas items objects created. Spawnrate: ${this.chanceCommercial}%`
    );
    debug(
      `WOM: Farm Areas items objects created. Spawnrate: ${this.chanceFarm}%`
    );
    debug(`WOM: Hospital objects created. Spawnrate: ${this.chanceHospital}%`);
    debug(`WOM: Military objects created. Spawnrate: ${this.chanceMilitary}%`);
  }

  createAR15(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawner_Weapon_M16A4.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_AR15, count: 1 });
        break;
      case "ItemSpawner_AmmoBox02_M16A4.adr":
        authorizedItems.push({
          id: this.eItems.AMMO_223,
          count: getItemSpawnCount(5, 10),
        });
        break;
      case "ItemSpawner_AmmoBox02.adr":
        authorizedItems.push({
          id: this.eItems.AMMO_223,
          count: getItemSpawnCount(1, 5),
        });
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceAR15) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }
  createPumpShotgun(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawner_Weapon_PumpShotgun01.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_SHOTGUN, count: 1 });
        break;
      case "ItemSpawner_AmmoBox02_12GaShotgun.adr":
        authorizedItems.push({
          id: this.eItems.AMMO_12GA,
          count: getItemSpawnCount(1, 3),
        });
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chancePumpShotgun) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }

  createTools(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawner_Weapon_Crowbar01.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_CROWBAR, count: 1 });
        break;
      case "ItemSpawner_Weapon_CombatKnife01.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_COMBATKNIFE, count: 1 });
        break;
      case "ItemSpawner_Weapon_Machete01.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_MACHETE01, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_KATANA, count: 1 }); // katana
        break;
      case "ItemSpawner_Weapon_Bat01.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_BAT_WOOD, count: 1 });
        break;
      case "ItemSpawner_BackpackOnGround001.adr":
        authorizedItems.push({ id: this.eItems.BACKPACK, count: 1 });
        break;
      case "ItemSpawner_GasCan01.adr":
        authorizedItems.push({ id: this.eItems.FUEL_BIOFUEL, count: 1 });
        break;
      case "ItemSpawner_Weapon_Guitar01.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_GUITAR, count: 1 });
        break;
      case "ItemSpawner_Weapon_WoodAxe01.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_AXE_WOOD, count: 1 });
        break;
      case "ItemSpawner_Weapon_FireAxe01.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_AXE_FIRE, count: 1 });
        break;
      case "ItemSpawner_Weapon_ClawHammer01.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_HAMMER, count: 1 });
        break;
      case "ItemSpawner_Weapon_Hatchet01.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_HATCHET, count: 1 });
        break;
      case "ItemSpawner_Weapon_Pipe01.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_PIPE, count: 1 });
        break;
      case "ItemSpawner_Weapon_Bat02.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_BAT_ALUM, count: 1 });
        break;
      case "ItemSpawner_Weapon_Bow.adr":
        authorizedItems.push({
          id: this.eItems.WEAPON_BOW_MAKESHIFT,
          count: 1,
        });
        authorizedItems.push({ id: this.eItems.WEAPON_BOW_WOOD, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_BOW_RECURVE, count: 1 });
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceTools) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }

  createPistols(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawner_Weapon_45Auto.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_45, count: 1 });
        break;
      case "ItemSpawner_Weapon_M9Auto.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_M9, count: 1 });
        break;
      case "ItemSpawner_AmmoBox02_1911.adr":
        authorizedItems.push({
          id: this.eItems.AMMO_1911,
          count: getItemSpawnCount(1, 5),
        }); //todo: find item spawner for m9 ammo
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chancePistols) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }

  createM24(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawner_Weapon_M24.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_308, count: 1 });
        break;
      case "ItemSpawner_AmmoBox02_308Rifle.adr":
        authorizedItems.push({
          id: this.eItems.AMMO_308,
          count: getItemSpawnCount(2, 4),
        });
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceM24) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }

  createConsumables(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawner_FirstAidKit.adr":
        authorizedItems.push({ id: this.eItems.FIRST_AID, count: 1 });
        break;
      case "ItemSpawner_CannedFood.adr":
        authorizedItems.push({ id: this.eItems.GROUND_COFFEE, count: 1 });
        authorizedItems.push({ id: this.eItems.CANNED_FOOD01, count: 1 });
        break;
      case "ItemSpawner_WaterContainer_Small_Purified.adr":
        authorizedItems.push({ id: this.eItems.WATER_PURE, count: 1 });
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceConsumables) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }

  createClothes(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawner_Clothes_MotorcycleHelmet.adr":
        authorizedItems.push({ id: this.eItems.HELMET_MOTORCYCLE, count: 1 });
        break;
      case "ItemSpawner_Clothes_BaseballCap.adr":
        authorizedItems.push({ id: this.eItems.HAT_CAP, count: 1 });
        break;
      case "ItemSpawner_Clothes_FoldedShirt.adr":
        authorizedItems.push({ id: this.eItems.SHIRT_DEFAULT, count: 1 });
        authorizedItems.push({ id: this.eItems.PANTS_DEFAULT, count: 1 });
        break;
      case "ItemSpawner_Clothes_Beanie.adr":
        authorizedItems.push({ id: this.eItems.HAT_BEANIE, count: 1 });
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceClothes) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }

  createResidential(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawnerResidential_Tier00.adr":
        authorizedItems.push({ id: this.eItems.SUGAR, count: 1 });
        authorizedItems.push({ id: this.eItems.SHIRT_DEFAULT, count: 1 });
        authorizedItems.push({ id: this.eItems.PANTS_DEFAULT, count: 1 });
        authorizedItems.push({ id: this.eItems.BATTERY, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_COMBATKNIFE, count: 1 });
        authorizedItems.push({ id: this.eItems.HAT_CAP, count: 1 });
        authorizedItems.push({ id: this.eItems.HAT_BEANIE, count: 1 });
        authorizedItems.push({ id: this.eItems.HELMET_MOTORCYCLE, count: 1 });
        authorizedItems.push({ id: this.eItems.CANNED_FOOD01, count: 1 });
        authorizedItems.push({ id: this.eItems.SALT, count: 1 });
        authorizedItems.push({ id: this.eItems.LIGHTER, count: 1 });
        authorizedItems.push({ id: this.eItems.WATER_EMPTY, count: 1 });
        authorizedItems.push({ id: this.eItems.WATER_PURE, count: 1 });
        authorizedItems.push({ id: this.eItems.AMMO_1911, count: 1 });
        authorizedItems.push({ id: this.eItems.AMMO_9MM, count: 1 });
        authorizedItems.push({ id: this.eItems.SPARKPLUGS, count: 1 });
        authorizedItems.push({ id: this.eItems.FIRST_AID, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_BINOCULARS, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_BAT_WOOD, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_BAT_ALUM, count: 1 });
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceResidential) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }

  createRare(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawnerRare_Tier00.adr":
        authorizedItems.push({
          id: this.eItems.AMMO_1911,
          count: getItemSpawnCount(1, 5),
        });
        authorizedItems.push({
          id: this.eItems.AMMO_9MM,
          count: getItemSpawnCount(1, 5),
        });
        authorizedItems.push({
          id: this.eItems.AMMO_380,
          count: getItemSpawnCount(1, 5),
        });
        authorizedItems.push({
          id: this.eItems.AMMO_223,
          count: getItemSpawnCount(1, 4),
        });
        authorizedItems.push({
          id: this.eItems.AMMO_762,
          count: getItemSpawnCount(1, 4),
        });
        authorizedItems.push({
          id: this.eItems.AMMO_308,
          count: getItemSpawnCount(1, 3),
        });
        authorizedItems.push({
          id: this.eItems.AMMO_12GA,
          count: getItemSpawnCount(1, 3),
        });
        authorizedItems.push({ id: this.eItems.WEAPON_45, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_308, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_SHOTGUN, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_AR15, count: 1 });
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceRare) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }

  createIndustrial(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawnerIndustrial_Tier00.adr":
        authorizedItems.push({ id: this.eItems.BATTERY, count: 1 });
        authorizedItems.push({ id: this.eItems.SPARKPLUGS, count: 1 });
        //headlights
        authorizedItems.push({
          id: this.eItems.HEADLIGHTS_OFFROADER,
          count: 1,
        });
        authorizedItems.push({ id: this.eItems.HEADLIGHTS_POLICE, count: 1 });
        authorizedItems.push({ id: this.eItems.HEADLIGHTS_ATV, count: 1 });
        authorizedItems.push({ id: this.eItems.HEADLIGHTS_PICKUP, count: 1 });
        // turbochargers
        authorizedItems.push({ id: this.eItems.TURBO_OFFROADER, count: 1 });
        authorizedItems.push({ id: this.eItems.TURBO_POLICE, count: 1 });
        authorizedItems.push({ id: this.eItems.TURBO_ATV, count: 1 });
        authorizedItems.push({ id: this.eItems.TURBO_PICKUP, count: 1 });

        authorizedItems.push({ id: this.eItems.WATER_EMPTY, count: 1 });
        authorizedItems.push({
          id: this.eItems.WOOD_PLANK,
          count: getItemSpawnCount(1, 5),
        });
        authorizedItems.push({
          id: this.eItems.METAL_SHEET,
          count: getItemSpawnCount(1, 3),
        });
        authorizedItems.push({
          id: this.eItems.METAL_SCRAP,
          count: getItemSpawnCount(1, 4),
        });
        authorizedItems.push({
          id: this.eItems.WEAPON_PIPE,
          count: getItemSpawnCount(1, 2),
        });
        authorizedItems.push({ id: this.eItems.WEAPON_AXE_WOOD, count: 1 });
        authorizedItems.push({
          id: this.eItems.TARP,
          count: getItemSpawnCount(1, 2),
        }); // tarp
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceIndustrial) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }

  createWorld(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawnerWorld_Tier00.adr":
        authorizedItems.push({ id: this.eItems.WEAPON_MACHETE01, count: 1 });
        authorizedItems.push({ id: this.eItems.WATER_EMPTY, count: 1 });
        authorizedItems.push({ id: this.eItems.WATER_PURE, count: 1 });
        authorizedItems.push({ id: this.eItems.SHIRT_DEFAULT, count: 1 });
        authorizedItems.push({ id: this.eItems.PANTS_DEFAULT, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_HATCHET, count: 1 });
        authorizedItems.push({ id: this.eItems.HAT_CAP, count: 1 });
        authorizedItems.push({ id: this.eItems.HAT_BEANIE, count: 1 });
        authorizedItems.push({ id: this.eItems.HELMET_MOTORCYCLE, count: 1 });
        authorizedItems.push({ id: this.eItems.CANNED_FOOD01, count: 1 });
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceWorld) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }

  createLog(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawner_Log01.adr":
        authorizedItems.push({
          id: this.eItems.WOOD_LOG,
          count: getItemSpawnCount(1, 4),
        }); // log
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceLog) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }

  createCommercial(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawnerCommercial_Tier00.adr":
        authorizedItems.push({ id: this.eItems.BATTERY, count: 1 });
        authorizedItems.push({ id: this.eItems.SPARKPLUGS, count: 1 });
        authorizedItems.push({ id: this.eItems.WATER_EMPTY, count: 1 });
        authorizedItems.push({ id: this.eItems.WATER_PURE, count: 1 });
        authorizedItems.push({ id: this.eItems.HELMET_MOTORCYCLE, count: 1 });
        authorizedItems.push({ id: this.eItems.SUGAR, count: 1 });
        authorizedItems.push({ id: this.eItems.SALT, count: 1 });
        authorizedItems.push({ id: this.eItems.CANNED_FOOD01, count: 1 });
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceCommercial) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }

  createFarm(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawnerFarm.adr":
        authorizedItems.push({ id: this.eItems.FERTILIZER, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_AXE_WOOD, count: 1 });
        authorizedItems.push({
          id: this.eItems.SEED_CORN,
          count: getItemSpawnCount(1, 3),
        });
        authorizedItems.push({
          id: this.eItems.SEED_WHEAT,
          count: getItemSpawnCount(1, 3),
        });
        authorizedItems.push({ id: this.eItems.WEAPON_HATCHET, count: 1 });
        authorizedItems.push({ id: this.eItems.WATER_EMPTY, count: 1 });
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceFarm) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }
  createHospital(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawnerHospital.adr":
        authorizedItems.push({ id: this.eItems.FIRST_AID, count: 1 });
        authorizedItems.push({ id: this.eItems.MRE_APPLE, count: 1 });
        authorizedItems.push({
          id: this.eItems.BANDAGE,
          count: getItemSpawnCount(1, 2),
        });
        authorizedItems.push({
          id: this.eItems.VIAL_EMPTY,
          count: getItemSpawnCount(1, 2),
        });
        authorizedItems.push({
          id: this.eItems.SYRINGE_EMPTY,
          count: getItemSpawnCount(1, 2),
        });
        authorizedItems.push({ id: this.eItems.SHIRT_DEFAULT, count: 1 });
        authorizedItems.push({ id: this.eItems.PANTS_DEFAULT, count: 1 });
        authorizedItems.push({ id: this.eItems.WATER_PURE, count: 1 });
        authorizedItems.push({ id: this.eItems.WATER_EMPTY, count: 1 });
        // todo add cloth spawn
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceHospital) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }
  createMilitary(server: ZoneServer2016, spawnerType: any) {
    const authorizedItems: Array<{ id: number; count: number }> = [];
    switch (spawnerType.actorDefinition) {
      case "ItemSpawner_Z1_MilitaryBase_Tents1.adr": // uncommon
        authorizedItems.push({ id: this.eItems.WEAPON_CROSSBOW, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_R380, count: 1 });
        authorizedItems.push({ id: this.eItems.GHILLIE_SUIT, count: 1 });
        authorizedItems.push({ id: this.eItems.HELMET_MOTORCYCLE, count: 1 });
        authorizedItems.push({ id: this.eItems.HELMET_TACTICAL, count: 1 });
        authorizedItems.push({ id: this.eItems.RESPIRATOR, count: 1 });
        authorizedItems.push({ id: this.eItems.FIRST_AID, count: 1 });
        //ammo
        authorizedItems.push({
          id: this.eItems.AMMO_1911,
          count: getItemSpawnCount(1, 10),
        });
        authorizedItems.push({
          id: this.eItems.AMMO_9MM,
          count: getItemSpawnCount(1, 10),
        });
        authorizedItems.push({
          id: this.eItems.AMMO_380,
          count: getItemSpawnCount(1, 10),
        });
        authorizedItems.push({
          id: this.eItems.AMMO_223,
          count: getItemSpawnCount(1, 10),
        });
        authorizedItems.push({
          id: this.eItems.AMMO_762,
          count: getItemSpawnCount(1, 10),
        });
        authorizedItems.push({
          id: this.eItems.AMMO_308,
          count: getItemSpawnCount(1, 5),
        });
        authorizedItems.push({
          id: this.eItems.AMMO_12GA,
          count: getItemSpawnCount(1, 6),
        });

        authorizedItems.push({ id: this.eItems.NV_GOGGLES, count: 1 });
        authorizedItems.push({ id: this.eItems.MRE_APPLE, count: 1 });
        break;
      case "ItemSpawner_Z1_MilitaryBase_Tents2.adr": // rare
        authorizedItems.push({ id: this.eItems.WEAPON_MOLOTOV, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_MAGNUM, count: 1 });
        authorizedItems.push({
          id: this.eItems.AMMO_308,
          count: getItemSpawnCount(1, 5),
        });
        authorizedItems.push({
          id: this.eItems.AMMO_12GA,
          count: getItemSpawnCount(1, 6),
        });
        authorizedItems.push({ id: this.eItems.GUNPOWDER, count: 1 });
        authorizedItems.push({ id: this.eItems.LANDMINE, count: 1 });
        authorizedItems.push({ id: this.eItems.KEVLAR_DEFAULT, count: 1 });
        break;
      case "ItemSpawner_Z1_MilitaryBase_MotorPool.adr": // common
        authorizedItems.push({ id: this.eItems.WEAPON_BINOCULARS, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_COMBATKNIFE, count: 1 });
        authorizedItems.push({ id: this.eItems.FLARE, count: 1 });
        authorizedItems.push({ id: this.eItems.METAL_SCRAP, count: 1 });
        authorizedItems.push({
          id: this.eItems.CLOTH,
          count: getItemSpawnCount(1, 5),
        });
        authorizedItems.push({ id: this.eItems.WEAPON_FLASHLIGHT, count: 1 });
        authorizedItems.push({
          id: this.eItems.TARP,
          count: getItemSpawnCount(1, 2),
        });
        authorizedItems.push({ id: this.eItems.MRE_APPLE, count: 1 });
        break;
      case "ItemSpawner_Z1_MilitaryBase_Hangar.adr": // industrial
        authorizedItems.push({
          id: this.eItems.METAL_SHEET,
          count: getItemSpawnCount(1, 3),
        });
        authorizedItems.push({
          id: this.eItems.METAL_SCRAP,
          count: getItemSpawnCount(1, 4),
        });
        authorizedItems.push({
          id: this.eItems.WEAPON_PIPE,
          count: getItemSpawnCount(1, 2),
        });

        authorizedItems.push({ id: this.eItems.WEAPON_CROWBAR, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_HAMMER, count: 1 });
        authorizedItems.push({ id: this.eItems.FUEL_BIOFUEL, count: 1 });
        authorizedItems.push({ id: this.eItems.BATTERY, count: 1 });
        authorizedItems.push({ id: this.eItems.SPARKPLUGS, count: 1 });
        authorizedItems.push({ id: this.eItems.WEAPON_WRENCH, count: 1 });

        //headlights
        authorizedItems.push({
          id: this.eItems.HEADLIGHTS_OFFROADER,
          count: 1,
        });
        authorizedItems.push({ id: this.eItems.HEADLIGHTS_POLICE, count: 1 });
        authorizedItems.push({ id: this.eItems.HEADLIGHTS_ATV, count: 1 });
        authorizedItems.push({ id: this.eItems.HEADLIGHTS_PICKUP, count: 1 });
        // turbochargers
        authorizedItems.push({ id: this.eItems.TURBO_OFFROADER, count: 1 });
        authorizedItems.push({ id: this.eItems.TURBO_POLICE, count: 1 });
        authorizedItems.push({ id: this.eItems.TURBO_ATV, count: 1 });
        authorizedItems.push({ id: this.eItems.TURBO_PICKUP, count: 1 });
        break;
      case "ItemSpawner_Weapon_GrenadeSmoke.adr":
        authorizedItems.push({ id: this.eItems.GRENADE_SMOKE, count: 1 });
        break;
      case "ItemSpawner_Weapon_GrenadeFlashbang.adr":
        authorizedItems.push({ id: this.eItems.GRENADE_FLASH, count: 1 });
        break;
      case "ItemSpawner_Weapon_GrenadeGas.adr":
        authorizedItems.push({ id: this.eItems.GRENADE_GAS, count: 1 });
        break;
      case "ItemSpawner_Weapon_GrenadeHE.adr":
        authorizedItems.push({ id: this.eItems.GRENADE_HE, count: 1 });
        break;
      default:
        break;
    }
    if (authorizedItems.length) {
      spawnerType.instances.forEach((itemInstance: any) => {
        if (this._spawnedObjects[itemInstance.id]) return;
        const chance = Math.floor(Math.random() * 100) + 1; // temporary spawnchance
        if (chance <= this.chanceMilitary) {
          // temporary spawnchance
          const item = getRandomItem(authorizedItems);
          this.createLootEntity(
            server,
            item.id,
            item.count,
            itemInstance.position,
            itemInstance.rotation,
            itemInstance.id
          );
        }
      });
    }
  }
}