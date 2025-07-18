// ============================================================================
// 📦 Импорты
// ============================================================================
const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  globalShortcut,
  protocol,
  shell,
  powerSaveBlocker,
  dialog,
  Tray,
  Menu,
} = require("electron")
const { autoUpdater } = require("electron-updater")
const path = require("path")
const fs = require("fs")

// ============================================================================
// 🧱 Глобальные переменные
// ============================================================================
let mainWindow
let gameView
let tray
let powerSaveBlockerId

// ============================================================================
// ⚙️ Настройки запуска
// ============================================================================
app.commandLine.appendSwitch("disable-background-timer-throttling")
app.commandLine.appendSwitch("disable-renderer-backgrounding")
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows")

// ============================================================================
// 🔧 Конфигурация главного окна
// ============================================================================
function getWindowConfig() {
  return {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  }
}

// ============================================================================
// 🪟 Создание окна и BrowserView
// ============================================================================
function createWindow() {
  mainWindow = new BrowserWindow(getWindowConfig())

  mainWindow.once("ready-to-show", () => mainWindow.show())
  mainWindow.loadFile("index.html")
  mainWindow.setMenuBarVisibility(false)
  // mainWindow.webContents.openDevTools({ mode: "detach" })

  createGameView()
  setupWindowEvents()
}

// ============================================================================
// 🌐 Создание и настройка BrowserView
// ============================================================================
function createGameView() {
  gameView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "inject-preload.js"),
      partition: "persist:gamebot",
      sandbox: true,
    },
  })

  mainWindow.setBrowserView(gameView)
  resizeGameView()

  gameView.webContents.loadURL("https://game.league17.ru/")
  // gameView.webContents.openDevTools({ mode: "detach" })

  // Безопасная навигация
  gameView.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  gameView.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("https://game.league17.ru/")) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  gameView.webContents.on("did-fail-load", (_, __, desc) => {
    mainWindow.webContents.send("status-update", `Ошибка загрузки: ${desc}`)
  })

  gameView.webContents.on("dom-ready", async () => {
    await injectBundleCSS()
    await injectBundleJS()
  })
}

// ============================================================================
// Внедрение CSS и JS
// ============================================================================
async function injectBundleCSS() {
  try {
    const css = await fs.promises.readFile(path.join(__dirname, "bundle.css"), "utf-8")
    await gameView.webContents.insertCSS(css)
  } catch (e) {
    console.warn("[CSS] Не удалось загрузить bundle.css", e)
  }
}

async function injectBundleJS() {
  try {
    const js = await fs.promises.readFile(path.join(__dirname, "bundle.js"), "utf-8")
    await gameView.webContents.executeJavaScript(js)
  } catch (e) {
    console.warn("[JS] Не удалось загрузить bundle.js", e)
  }
}

// ============================================================================
// Обработчики событий окна
// ============================================================================
function setupWindowEvents() {
  mainWindow.on("resize", resizeGameView)

  mainWindow.on("focus", () => {
    gameView.webContents.focus()
  })

  mainWindow.on("show", () => {
    gameView.webContents.focus()
  })

  mainWindow.on("minimize", (event) => {
    event.preventDefault()
    mainWindow.hide()
  })
}

function resizeGameView() {
  if (!mainWindow || !gameView) return
  const [width, height] = mainWindow.getContentSize()
  gameView.setBounds({ x: 0, y: 0, width, height })
  gameView.setAutoResize({ width: true, height: true })
}

// ============================================================================
// Глобальные горячие клавиши
// ============================================================================
function registerGlobalShortcuts() {
  globalShortcut.register("F5", () => {
    if (mainWindow?.isFocused() && gameView?.webContents?.isDestroyed?.() === false) {
      gameView.webContents.reload()
    }
  })
}

// ============================================================================
//  Трей
// ============================================================================
function setupTray() {
  tray = new Tray(path.join(__dirname, "console.png"))
  tray.setToolTip("League17 Game Bot")

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Показать",
        click: () => {
          mainWindow.show()
          mainWindow.focus()
          gameView.webContents.focus()
        },
      },
      { label: "Выход", click: () => app.quit() },
    ])
  )

  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
      gameView.webContents.focus()
    }
  })
}

// ============================================================================
// 🛡️ Энергосбережение
// ============================================================================
function setupPowerSaveBlocker() {
  powerSaveBlockerId = powerSaveBlocker.start("prevent-display-sleep")
}

// ============================================================================
// 🚀 Инициализация приложения
// ============================================================================
app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const url = request.url.replace("app://local/", "")
    const filePath = path.normalize(path.join(__dirname, url))
    if (!filePath.startsWith(path.normalize(__dirname))) {
      return new Response(null, { status: 404 })
    }
    return new Response(fs.createReadStream(filePath))
  })

  createWindow()
  setupTray()
  setupPowerSaveBlocker()
  registerGlobalShortcuts()
  // Проверка обновлений через 3 секунды после запуска
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify()
  }, 3000)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  process.on("uncaughtException", (err) => {
    console.error("[Uncaught Exception]", err)
  })
})
autoUpdater.on("update-available", () => {
  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Обновление доступно",
    message: "Найдено новое обновление. Оно будет загружено в фоновом режиме.",
    buttons: ["OK"],
  })
})

autoUpdater.on("update-downloaded", () => {
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      title: "Обновление готово",
      message: "Обновление загружено. Приложение будет перезапущено для применения обновления.",
      buttons: ["Перезапустить", "Позже"],
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
})

autoUpdater.on("error", (err) => {
  dialog.showErrorBox("Ошибка обновления", err == null ? "unknown" : (err.stack || err).toString())
})
// ============================================================================
// ❌ Завершение работы
// ============================================================================
app.on("window-all-closed", () => {
  globalShortcut.unregisterAll()
  if (powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlocker.stop(powerSaveBlockerId)
  }
  if (process.platform !== "darwin") app.quit()
})
