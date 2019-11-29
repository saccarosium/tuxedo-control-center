/*!
 * Copyright (c) 2019 TUXEDO Computers GmbH <tux@tuxedocomputers.com>
 *
 * This file is part of TUXEDO Control Center.
 *
 * TUXEDO Control Center is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * TUXEDO Control Center is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with TUXEDO Control Center.  If not, see <https://www.gnu.org/licenses/>.
 */
import { DaemonWorker } from './DaemonWorker';
import { DisplayBacklightController } from '../../common/classes/DisplayBacklightController';

import * as path from 'path';
import { TuxedoControlCenterDaemon } from './TuxedoControlCenterDaemon';

export class DisplayBacklightWorker extends DaemonWorker {

    private controllers: DisplayBacklightController[];
    private basePath = '/sys/class/backlight';

    constructor(tccd: TuxedoControlCenterDaemon) {
        super(3000, tccd);
    }

    public onStart(): void {
        // Find drivers
        const displayDrivers = DisplayBacklightController.getDeviceList(this.basePath);
        this.controllers = [];
        displayDrivers.forEach((driverName) => {
            this.controllers.push(new DisplayBacklightController(this.basePath, driverName));
        });

        const currentProfile = this.tccd.getCurrentProfile();
        // Try all possible drivers to be on the safe side, fail silently if they do not work
        this.controllers.forEach((controller) => {
            let brightnessPercent: number;
            let brightnessRaw: number;
            try {
                const maxBrightness = controller.maxBrightness.readValue();
                if (!currentProfile.display.useBrightness || currentProfile.display.brightness === undefined) {
                    if (this.tccd.autosave.displayBrightness === undefined) {
                        brightnessPercent = 100;
                    } else {
                        brightnessPercent = this.tccd.autosave.displayBrightness;
                    }
                } else {
                    brightnessPercent = currentProfile.display.brightness;
                }
                brightnessRaw = Math.round((brightnessPercent * maxBrightness) / 100);
                controller.brightness.writeValue(brightnessRaw);

                this.tccd.logLine('Set display brightness to '
                    + brightnessPercent + '% (' + brightnessRaw + ') on ' + controller.driver);
            } catch (err) {
                this.tccd.logLine('Failed to set display brightness to '
                    + brightnessPercent + '% (' + brightnessRaw + ') on ' + controller.driver);
            }
        });
    }

    public onWork(): void {
        // Possibly save brightness regularly
        for (const controller of this.controllers) {
            let value: number;
            let maxBrightness: number;

            try {
                value = controller.brightness.readValue();
                maxBrightness = controller.maxBrightness.readValue();
                if (!Number.isNaN(value) && value !== 0) {
                    this.tccd.autosave.displayBrightness = Math.round((value * 100) / maxBrightness);
                }
            } catch (err) {
                this.tccd.logLine('DisplayBacklightWorker => ' + err);
            }
        }
    }

    public onExit(): void {
        this.controllers.forEach((controller) => {
            let value: number;
            let maxBrightness: number;
            try {
                value = controller.brightness.readValue();
                maxBrightness = controller.maxBrightness.readValue();
            } catch (err) {
                this.tccd.logLine('DisplayBacklightWorker: Failed to read display brightness on exit from '
                    + controller.driver + ' => ' + err);
            }
            if (value !== undefined) {
                if (value === 0) {
                    this.tccd.logLine('DisplayBacklightWorker: Refused to save display brightness 0 from ' + controller.driver);
                } else {
                    this.tccd.autosave.displayBrightness = Math.round((value * 100) / maxBrightness);
                    this.tccd.logLine('DisplayBacklightWorker: Save display brightness '
                        + this.tccd.autosave.displayBrightness + '% (' + value + ') on exit');
                }
            }
        });
    }

}
