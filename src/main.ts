// import Neutralino from "@neutralinojs/lib"

declare const Neutralino: any;

function onWindowClose() {
    Neutralino.app.exit();
}

Neutralino.init();

// Neutralino.events.on("trayMenuItemClicked", onTrayMenuItemClicked);
Neutralino.events.on("windowClose", onWindowClose);
