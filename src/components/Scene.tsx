/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DarkSoulsHoloCard } from "@designcodeio/threeui";
import "@designcodeio/threeui/style.css";

export function Scene() {
  return (
    <div className="shader-frame">
      <DarkSoulsHoloCard
        variant="ashen-one"
      />
    </div>
  );
}
