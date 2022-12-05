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

import { toHex } from "../../../utils/utils";
import { ZoneServer2016 } from "../zoneserver";
import { BaseItem } from "./baseItem";
import { ZoneClient2016 } from "./zoneclient";

export class Weapon {
  item: BaseItem;
  ammoCount: number;
  reloadTimer?: NodeJS.Timeout;
  currentReloadCount = 0; // needed for reload packet to work every time
  constructor(item: BaseItem, ammoCount?: number) {
    this.item = item;
    this.ammoCount = ammoCount || 0;
  }

  unload(server: ZoneServer2016, client: ZoneClient2016) {
    if (!this.item || !this.ammoCount) return;
    server.lootItem(
      client,
      server.generateItem(
        server.getWeaponAmmoId(this.item.itemDefinitionId),
        this.ammoCount
      )
    );
    this.ammoCount = 0;
    if (client.character.getEquippedWeapon().itemGuid == this.item.itemGuid) {
      server.sendWeaponData(client, "Weapon.Reload", {
        weaponGuid: this.item.itemGuid,
        unknownDword1: 0,
        ammoCount: 0,
        unknownDword3: 0,
        currentReloadCount: toHex(++this.currentReloadCount),
      });
    }
  }
}
