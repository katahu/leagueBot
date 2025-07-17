// file: inject-preload.js
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('soundAPI', {
  play: async (src) => {
    try {
      const audio = new Audio(src)
      await audio.play()
      await new Promise((resolve) => audio.addEventListener('ended', resolve, { once: true }))
    } catch (e) {
      console.error('Ошибка воспроизведения:', e)
    }
  },
})
