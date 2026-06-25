const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 680,
    resizable: false,
    frame: true,
    title: '番茄钟',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 窗口关闭时最小化到托盘而不是退出
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTrayIcon() {
  // 创建一个 16x16 的红色番茄图标
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4); // RGBA

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // 圆心 (8, 8)，半径 7
      const dx = x - 7.5;
      const dy = y - 7.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= 6.5) {
        // 主体红色
        buffer[idx] = 255;     // R
        buffer[idx + 1] = 76;  // G
        buffer[idx + 2] = 54;  // B
        buffer[idx + 3] = 255; // A
      } else if (dist <= 7) {
        // 边缘抗锯齿
        const alpha = Math.round((7 - dist) / 0.5 * 255);
        buffer[idx] = 255;
        buffer[idx + 1] = 76;
        buffer[idx + 2] = 54;
        buffer[idx + 3] = Math.min(255, alpha);
      } else {
        // 透明
        buffer[idx + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);

  // 使用 emoji 作为托盘提示
  tray.setToolTip('番茄钟 - 运行中');

  updateTrayMenu();

  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function updateTrayMenu(timerText = '番茄钟') {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    { label: timerText, enabled: false },
    { type: 'separator' },
    {
      label: '显示窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// IPC 处理：发送系统通知
ipcMain.handle('show-notification', async (event, { title, body }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: title,
      body: body,
    });
    notification.show();

    notification.on('click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  }
});

// IPC 处理：更新托盘提示
ipcMain.handle('update-tray', async (event, { tooltip, timerText }) => {
  if (tray) {
    tray.setToolTip(tooltip);
    updateTrayMenu(timerText);
  }
});

// IPC 处理：设置窗口置顶
ipcMain.handle('set-always-on-top', async (event, flag) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(flag);
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
