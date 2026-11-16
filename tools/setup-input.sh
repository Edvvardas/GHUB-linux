#!/usr/bin/env bash
# Run on the desktop host; grants the active user the receiver's mouse events.
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
echo 'Installing input access for Logitech receiver 046d:c547 mouse interfaces.'
sudo install -m 0644 "$script_dir/70-lghub-linux-input.rules" /etc/udev/rules.d/70-lghub-linux-input.rules
sudo udevadm control --reload-rules
sudo udevadm trigger --action=change --subsystem-match=input
udevadm settle
if [[ ! -e /dev/uinput ]]; then
    echo 'Loading the Linux virtual-input module.'
    sudo modprobe uinput
fi
if [[ ! -r /dev/uinput || ! -w /dev/uinput ]]; then
    echo '/dev/uinput is not accessible. The runtime needs virtual-input access.'
    echo 'An active-seat uaccess rule is provided separately in 70-lghub-linux-uinput.rules.'
    echo 'Install it only for the user session that will run assignments:'
    echo "  sudo install -m 0644 '$script_dir/70-lghub-linux-uinput.rules' /etc/udev/rules.d/70-lghub-linux-uinput.rules"
    echo '  sudo udevadm control --reload-rules'
    echo '  sudo udevadm trigger --action=change --subsystem-match=misc'
fi
echo 'Reconnect the receiver if needed, then reload Inputs in the Assignments page.'
echo 'This does not start remapping or change mouse firmware.'
