# minimal-keys Studio - Firmware Setup

## Current Status
The minimal-keys firmware already has basic ZMK Studio support enabled:
- `CONFIG_ZMK_STUDIO=y` (both sides)
- `CONFIG_ZMK_STUDIO_LOCKING=n` (both sides)
- `snippet: studio-rpc-usb-uart` (build.yaml)

The **Keymap** tab works with the current firmware out of the box.

## Custom Module Setup (Optional)

To enable the **Trackball**, **Bluetooth**, **Battery**, and **Settings** tabs,
the firmware needs additional modules from cormoran's ZMK fork.

### Step 1: Update west.yml

Replace `config/west.yml` with:

```yaml
manifest:
  remotes:
    - name: zmkfirmware
      url-base: https://github.com/zmkfirmware
    - name: hyhy-masa
      url-base: https://github.com/hyhy-masa
    - name: caksoylar
      url-base: https://github.com/caksoylar
    - name: cormoran
      url-base: https://github.com/cormoran
  projects:
    - name: zmk
      remote: cormoran
      revision: v0.3-branch+custom-studio-protocol+ble
      import: app/west.yml
    - name: zmk-pmw3610-driver
      remote: hyhy-masa
      revision: main
    - name: zmk-rgbled-widget
      remote: caksoylar
      revision: main
    - name: zmk-module-runtime-input-processor
      remote: cormoran
      revision: main
    - name: zmk-module-ble-management
      remote: cormoran
      revision: main
    - name: zmk-module-battery-history
      remote: cormoran
      revision: main
    - name: zmk-module-settings-rpc
      remote: cormoran
      revision: main
  self:
    path: config
```

### Step 2: Update minimal-keys_R.conf

Add to `config/boards/shields/minimal-keys/minimal-keys_R.conf`:

```
# Custom Studio modules
CONFIG_ZMK_RUNTIME_INPUT_PROCESSOR=y
CONFIG_ZMK_RUNTIME_INPUT_PROCESSOR_STUDIO_RPC=y
CONFIG_ZMK_BLE_MANAGEMENT=y
CONFIG_ZMK_BLE_MANAGEMENT_STUDIO_RPC=y
CONFIG_ZMK_BATTERY_HISTORY=y
CONFIG_ZMK_BATTERY_HISTORY_STUDIO_RPC=y
CONFIG_ZMK_SETTINGS_RPC=y
CONFIG_ZMK_SETTINGS_RPC_STUDIO=y
```

### Step 3: Update minimal-keys_L.conf

Add to `config/boards/shields/minimal-keys/minimal-keys_L.conf`:

```
CONFIG_ZMK_BATTERY_HISTORY=y
CONFIG_ZMK_BATTERY_HISTORY_STUDIO_RPC=y
CONFIG_ZMK_SETTINGS_RPC=y
CONFIG_ZMK_SETTINGS_RPC_STUDIO=y
```

### Step 4: Build & Flash

Rebuild the firmware via GitHub Actions or locally, then flash to both halves.

### Notes
- USB cable should be connected to the **right side** (Central)
- cormoran's ZMK fork is based on v0.3 with custom studio protocol extensions
- The PMW3610 driver should remain compatible with the custom fork
- RAM usage will increase; nRF52840 should have sufficient memory
