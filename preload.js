const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomodoroAPI', {
  // 发送系统通知
  showNotification: (title, body) => {
    return ipcRenderer.invoke('show-notification', { title, body });
  },

  // 更新系统托盘
  updateTray: (tooltip, timerText) => {
    return ipcRenderer.invoke('update-tray', { tooltip, timerText });
  },

  // 设置窗口始终置顶
  setAlwaysOnTop: (flag) => {
    return ipcRenderer.invoke('set-always-on-top', flag);
  },
});
