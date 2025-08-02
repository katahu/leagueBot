const arrTarget = [
  "Вы уверены, что хотите сдаться?",
  "Вы будете перенесены на локацию - Арена Лиги Чемпионов, стоимость: 500 кр. Продолжить?",
  "Вы хотите вернуться на локацию, из которой вы переместились на арену?",
]

;(function () {
  window.__originalConfirm = window.confirm
  window.useCustomConfirm = false

  window.addEventListener("toggleConfirmInterceptor", (event) => {
    window.useCustomConfirm = event.detail.enabled
  })

  window.confirm = function (message) {
    if (window.useCustomConfirm && arrTarget.some((target) => message.includes(target))) {
      return true
    }
    return window.__originalConfirm(message)
  }
})()

// Локации постоянные
;(() => {
  const pendingRequests = new Map() // url -> { resolve, timeoutId }
  const alwaysListenUrl = "/do/loc/go" // URL для постоянного мониторинга

  function waitForRequest(url, timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (pendingRequests.has(url)) {
        reject(new Error(`Already waiting for request: ${url}`))
        return
      }

      const timeoutId = setTimeout(() => {
        if (pendingRequests.has(url)) {
          pendingRequests.delete(url)
          reject(new Error(`Timeout waiting for request: ${url}`))
        }
      }, timeout)

      pendingRequests.set(url, { resolve, timeoutId })
    })
  }

  function maybeResolvePending(url, data) {
    for (const [pendingUrl, { resolve, timeoutId }] of pendingRequests.entries()) {
      if (url.includes(pendingUrl)) {
        clearTimeout(timeoutId)
        resolve(data)
        pendingRequests.delete(pendingUrl)
        break
      }
    }
  }

  // Перехват XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this._url = url
    return originalOpen.call(this, method, url, ...args)
  }

  XMLHttpRequest.prototype.send = function (body) {
    this.addEventListener("load", () => {
      try {
        if (!this.responseText) return
        const json = JSON.parse(this.responseText)

        maybeResolvePending(this._url, json)

        if (this._url && this._url.includes(alwaysListenUrl)) {
          const locId = json?.object?.loc?.id
          if (locId !== undefined) {
            window.postMessage(
              {
                type: "LOC_ID_UPDATE",
                locId: locId,
                fullData: json,
              },
              "*"
            )
          }
        }
      } catch (e) {
        // Игнорируем ошибки парсинга
      }
    })
    return originalSend.call(this, body)
  }

  // Обработка сообщений от контент-скрипта
  window.addEventListener("message", async (event) => {
    if (event.source !== window) return

    if (event.data.type === "WAIT_FOR_REQUEST" && typeof event.data.url === "string") {
      try {
        const data = await waitForRequest(event.data.url, event.data.timeout)
        window.postMessage(
          {
            type: "REQUEST_RESOLVED",
            source: "XHR_MONITOR",
            requestId: event.data.requestId,
            url: event.data.url,
            response: data,
          },
          "*"
        )
      } catch (error) {
        window.postMessage(
          {
            type: "REQUEST_TIMEOUT",
            source: "XHR_MONITOR",
            requestId: event.data.requestId,
            url: event.data.url,
            error: error.message,
          },
          "*"
        )
      }
    }
  })
})()

// Локация при старте
;(function () {
  const origOpen = XMLHttpRequest.prototype.open
  const origSend = XMLHttpRequest.prototype.send

  let active = true

  XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
    this._url = url
    return origOpen.apply(this, arguments)
  }

  XMLHttpRequest.prototype.send = function (body) {
    if (!active) return origSend.apply(this, arguments)

    if (this._url && this._url.includes("/do/loc/load")) {
      this.addEventListener("load", function () {
        if (!active) return

        try {
          const responseJSON = JSON.parse(this.responseText)

          // Вызываем внешнюю функцию, объявленную в content script
          window.postMessage(
            {
              type: "init-data",
              ...responseJSON,
            },
            "*"
          )

          // Отключаем перехват
          active = false
        } catch (e) {
          console.warn("[XHR Interceptor] Ошибка разбора:", e)
        }
      })
    }

    return origSend.apply(this, arguments)
  }
})()
// function injectConfirmOverride() {
//   const script = document.createElement('script')
//   script.src = chrome.runtime.getURL('inject.js')
//   script.type = 'text/javascript'
//   document.documentElement.appendChild(script)
//   script.remove()
// }
// injectConfirmOverride()

function toggleConfirmInterceptor(enabled) {
  window.dispatchEvent(new CustomEvent('toggleConfirmInterceptor', { detail: { enabled } }))
}

function showNotification(title, text) {
  if (window.AndroidInterface) {
    return
  }

  if (Notification.permission === 'granted') {
    new Notification(title, { body: text })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(title, { body: text })
      }
    })
  }
}

function waitForXHR(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const requestId = Date.now() + Math.random()

    const messageHandler = (event) => {
      if (event.source !== window) return

      if (event.data.type === 'REQUEST_RESOLVED' && event.data.requestId === requestId) {
        window.removeEventListener('message', messageHandler)
        resolve(event.data.response)
      }

      if (event.data.type === 'REQUEST_TIMEOUT' && event.data.requestId === requestId) {
        window.removeEventListener('message', messageHandler)
        reject(new Error(event.data.error))
      }
    }

    window.addEventListener('message', messageHandler)

    window.postMessage(
      {
        type: 'WAIT_FOR_REQUEST',
        url: url,
        timeout: timeout,
        requestId: requestId,
      },
      '*'
    )
  })
}

// cat inject.js utils.js timer.js config.js render.js config-ui.js themeController.js heal.js useItem.js dropController.js dev.js antibot.js routerHeal.js autoAd.js > bundle.js
// cat ./css/fonts.css ./css/style.css > bundle.css

// Обновить на новую версию:
// git add .
// git commit -m "Release v1.0.7"
// git push origin main
// git tag v1.0.7
// git push origin v1.0.7

// Либо:

// npm version patch
// git push --follow-tags

// npm version patch -m "Release v1.0.8"   // тут он сразу патчит в package.json новую версию.
// git push --follow-tags // тут он отправляет в гит новую версию
class TimePicker {
  constructor() {
    this.ITEM_HEIGHT = 40
    this.LOOP_COUNT = 3

    this.container = document.createElement('div')
    this.container.classList.add('timer-container')

    this.content = document.createElement('div')
    this.content.classList.add('timer-content')

    this.hoursWheel = this.createWheel('hours', 24)
    this.minutesWheel = this.createWheel('minutes', 60)

    this.title = document.createElement('div')
    this.title.classList.add('timer-title')
    this.title.textContent = 'Время указывать по лиге'

    this.centerIndicator = document.createElement('div')
    this.centerIndicator.classList.add('timer-indicator')

    this.separator = document.createElement('div')
    this.separator.classList.add('timer-separator')
    this.separator.textContent = ':'

    this.result = document.createElement('div')
    this.result.classList.add('timer-result')

    this.content.append(this.hoursWheel, this.separator, this.minutesWheel, this.centerIndicator)
    this.container.append(this.title, this.content, this.result)

    this.attachDragScroll(this.hoursWheel, 24)
    this.attachDragScroll(this.minutesWheel, 60)

    this.resetScroll(this.hoursWheel, 24)
    this.resetScroll(this.minutesWheel, 60)

    this.logCenterTime()
  }

  createWheel(name, max) {
    const wheel = document.createElement('div')
    wheel.classList.add('list-timer')
    wheel.dataset.name = name
    wheel.style.height = `${this.ITEM_HEIGHT * 3}px`

    for (let loop = 0; loop < this.LOOP_COUNT; loop++) {
      for (let i = 0; i < max; i++) {
        const el = document.createElement('div')
        el.className = 'timer-item'
        el.textContent = i.toString().padStart(2, '0')
        el.style.height = `${this.ITEM_HEIGHT}px`
        wheel.appendChild(el)
      }
    }

    return wheel
  }

  resetScroll(wheel, itemCount) {
    wheel.scrollTop = itemCount * this.ITEM_HEIGHT
  }

  handleLoop(wheel, itemCount) {
    const maxScroll = this.ITEM_HEIGHT * itemCount * (this.LOOP_COUNT - 1)
    if (wheel.scrollTop <= this.ITEM_HEIGHT) {
      wheel.scrollTop += itemCount * this.ITEM_HEIGHT
    } else if (wheel.scrollTop >= maxScroll - this.ITEM_HEIGHT) {
      wheel.scrollTop -= itemCount * this.ITEM_HEIGHT
    }
  }

  getCenterValue(wheel, itemCount) {
    const items = wheel.querySelectorAll('.timer-item')
    const wheelRect = wheel.getBoundingClientRect()
    const centerY = wheelRect.top + wheel.clientHeight / 2

    let closest = null
    let minDistance = Infinity

    items.forEach((item) => {
      const rect = item.getBoundingClientRect()
      const itemCenterY = rect.top + rect.height / 2
      const distance = Math.abs(centerY - itemCenterY)
      if (distance < minDistance) {
        minDistance = distance
        closest = item
      }
    })

    if (!closest) return '--'
    return parseInt(closest.textContent, 10)
  }

  logCenterTime() {
    const hours = this.getCenterValue(this.hoursWheel, 24).toString().padStart(2, '0')
    const minutes = this.getCenterValue(this.minutesWheel, 60).toString().padStart(2, '0')
    // console.log(`Текущее время: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`)
    this.result.textContent = `Остановка в: ${hours}:${minutes}`
    settings.set('hourtimer', hours)
    settings.set('minutetimer', minutes)
  }

  attachDragScroll(wheel, itemCount) {
    let isDragging = false
    let startY = 0
    let scrollStart = 0

    const ITEM_HEIGHT = this.ITEM_HEIGHT

    const snapToClosest = () => {
      const scrollTop = wheel.scrollTop
      const nearestIndex = Math.round(scrollTop / ITEM_HEIGHT)
      const targetScrollTop = nearestIndex * ITEM_HEIGHT

      let start = null
      const duration = 200
      const initialScrollTop = scrollTop

      const animate = (time) => {
        if (!start) start = time
        const progress = Math.min((time - start) / duration, 1)
        wheel.scrollTop = initialScrollTop + (targetScrollTop - initialScrollTop) * progress
        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          this.handleLoop(wheel, itemCount)
          this.logCenterTime()
        }
      }
      requestAnimationFrame(animate)
    }

    const onPointerDown = (e) => {
      isDragging = true
      startY = e.clientY
      scrollStart = wheel.scrollTop
      if (this.momentumId) {
        cancelAnimationFrame(this.momentumId)
        this.momentumId = null
      }
      e.target.setPointerCapture(e.pointerId)
      e.preventDefault()
    }

    const onPointerMove = (e) => {
      if (!isDragging) return
      const deltaY = e.clientY - startY
      wheel.scrollTop = scrollStart - deltaY
      this.handleLoop(wheel, itemCount)
      e.preventDefault()
    }

    const onPointerUp = (e) => {
      if (!isDragging) return
      isDragging = false
      snapToClosest()
      e.preventDefault()
    }

    wheel.addEventListener('wheel', (e) => e.preventDefault(), { passive: false })

    wheel.addEventListener('pointerdown', onPointerDown.bind(this))
    wheel.addEventListener('pointermove', onPointerMove.bind(this))
    wheel.addEventListener('pointerup', onPointerUp.bind(this))
    wheel.addEventListener('pointercancel', onPointerUp.bind(this))
  }
}

class AutoStop {
  constructor() {
    this.timer = null
    this.isActive = false
  }

  execute() {
    if (this.isActive) {
      return
    }

    this.isActive = true
    this.timer = setInterval(async () => {
      const timeNow = document.querySelector('#divDockClock').textContent.trim().split(':')
      const hour = timeNow[0]
      const minute = timeNow[1]

      if (hour === settings.get('hourtimer') && minute >= settings.get('minutetimer')) {
        bot.stop()
        GameUtils.btnWild(false)

        this.stop()

        toggleConfirmInterceptor(true)

        if (settings.get('transferAll') === true) {
          if (BattleState.isBattleActive()) {
            await this.handleCriticalSituation()
          }
          await new HealAction().execute(false, true)
        }
        toggleConfirmInterceptor(false)
      }
    }, 30 * 1000)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.isActive = false
  }
  async handleCriticalSituation() {
    if (BattleState.isAggressiveLocation()) {
      if (settings.get('monsterSwapEnabled') === true) {
        return new SwapAction().execute(true) // явно указать что в агро локации вызыва как критически
      }
      soundController.play('shine')
      showNotification('Внимание', 'Бот в ступоре')
      return
    } else {
      await new SurrenderAction().execute()
    }
  }
}

const autoStop = new AutoStop()
const arrMonstersAll = [
  'Жаблиф',
  'Жабзор',
  'Фолифрог',
  'Пламби',
  'Пламберт',
  'Огнекрыл',
  'Бранзер',
  'Бранторн',
  'Бранезавр',
  'Волек',
  'Изопод',
  'Световол',
  'Мотль',
  'Коккон',
  'Москилл',
  'Орли',
  'Орлин',
  'Орланор',
  'Пискун',
  'Крыскун',
  'Дроздор',
  'Дроздун',
  'Ополоз',
  'Гюрзар',
  'Ваттон',
  'Силоватт',
  'Кроут',
  'Кроттор',
  'Нинья',
  'Нинорьетта',
  'Нинорейна',
  'Ниньо',
  'Нинорино',
  'Нинорей',
  'Эстерелла',
  'Астерелла',
  'Ракода',
  'Ракуна',
  'Джипсон',
  'Сонсонг',
  'Шумышь',
  'Грюмышь',
  'Клуббиш',
  'Амбрук',
  'Мандракас',
  'Листотел',
  'Листвотел',
  'Редлик',
  'Шмелевик',
  'Потат',
  'Потатат',
  'Мукун',
  'Мурысь',
  'Болютка',
  'Акваус',
  'Малор',
  'Лемурил',
  'Огнепси',
  'Огнедзиси',
  'Капель',
  'Водель',
  'Грозель',
  'Эни',
  'Саам',
  'Сазам',
  'Рокиб',
  'Рокибор',
  'Квадроки',
  'Булли',
  'Буллит',
  'Буллитум',
  'Каллея',
  'Цианея',
  'Скалоб',
  'Ураллер',
  'Эверестор',
  'Эфон',
  'Флегон',
  'Дудося',
  'Лаголаг',
  'Дуоселл',
  'Октаселл',
  'Лутка',
  'Додронт',
  'Триодонт',
  'Нерп',
  'Хорвал',
  'Слизень',
  'Грязень',
  'Шелтер',
  'Армурена',
  'Ост',
  'Аспер',
  'Октор',
  'Рошер',
  'Ино',
  'Коршак',
  'Шримпер',
  'Злобстер',
  'Люминьон',
  'Люмьен',
  'Сидерс',
  'Саностридж',
  'Бонозавр',
  'Скуллозавр',
  'Шадо-Ли',
  'Шадо-Чан',
  'Эвилик',
  'Вупс',
  'Смоггер',
  'Булавир',
  'Булаврон',
  'Хилси',
  'Вьюнудль',
  'Кугу-мама',
  'Хорсилт',
  'Драуз',
  'Птерра',
  'Птеркус',
  'Скафиш',
  'Батискафиш',
  'Клошар',
  'Мантедж',
  'Кайла',
  'Электрозавр',
  'Лавазавр',
  'Дирбаг',
  'Элкас',
  'Сплешер',
  'Дибарак',
  'Несси',
  'Аморфон',
  'Эво',
  'Аквалит',
  'Вольталит',
  'Фларелит',
  'LIG-10001',
  'Спрутти',
  'Праспрут',
  'Лобит',
  'Трелоби',
  'Амбероптиль',
  'Наклес',
  'Гласеогриф',
  'Люмогриф',
  'Гелиогриф',
  'Имуги',
  'Кирин',
  'Илатон',
  'Мутаген',
  'Геном',
  'Терран',
  'Церрапт',
  'Террацерапт',
  'Сизль',
  'Фозис',
  'Сизелам',
  'Грен',
  'Гренуль',
  'Гренидра',
  'Джорбик',
  'Мармаус',
  'Сивун',
  'Фоуль',
  'Лептибаг',
  'Кокцинус',
  'Рахнус',
  'Арахнус',
  'Крестопырь',
  'Элфиш',
  'Аквольт',
  'Ваттоня',
  'Стрелла',
  'Джипсоня',
  'Овус',
  'Алас',
  'Майин',
  'Инкин',
  'Меешок',
  'Беешок',
  'Эфарол',
  'Маранолия',
  'Покут',
  'Мажиринко',
  'Древень',
  'Ливнель',
  'Дендино',
  'Камолино',
  'Дендилино',
  'Чухват',
  'Грути',
  'Бушрут',
  'Либеллёт',
  'Илполь',
  'Омутоль',
  'Люксеолит',
  'Нокталит',
  'Месьер',
  'Бсодинг',
  'Криселла',
  'Семант',
  'Мерсиш',
  'Унгну',
  'Кнур',
  'Кнурр',
  'Дуняш',
  'Скорпимер',
  'Грошар',
  'Битав',
  'Крачав',
  'Вартфиш',
  'Сизомант',
  'Джуснель',
  'Буллбаг',
  'Демот',
  'Коафи',
  'Коалень',
  'Фоснейл',
  'Фланжин',
  'Ленси',
  'Ленсерино',
  'Кореллик',
  'Рановак',
  'Ахевак',
  'Меррипик',
  'Скайт',
  'Орлармор',
  'Дэрдог',
  'Хэллдог',
  'Уздра',
  'Пынюх',
  'Чихон',
  'LIG-3265',
  'Элдор',
  'Эскизу',
  'Монки',
  'Шадо-Топ',
  'Гёрди',
  'Спаркозавр',
  'Эмброзавр',
  'Милгот',
  'Реззура',
  'Громмар',
  'Фламмар',
  'Гидррар',
  'Пылизар',
  'Ракоккон',
  'Пескозавр',
  'Нерейон',
  'Иридор',
  'Хроносид',
  'Прутти',
  'Стиклиф',
  'Гинкгон',
  'Карптах',
  'Хрустер',
  'Фанагал',
  'Зумфи',
  'Бростырь',
  'Мортортл',
  'Лайкун',
  'Арркун',
  'Путун',
  'Полкет',
  'Муваг',
  'Беллон',
  'Баттинун',
  'Ноктурс',
  'Баттнайти',
  'Ненуль',
  'Ненуфа',
  'Лилину',
  'Корнис',
  'Лифуду',
  'Легбамор',
  'Ванси',
  'Голона',
  'Сивинг',
  'Пелисир',
  'Сенс',
  'Сенсиа',
  'Семпатия',
  'Спибаг',
  'Физокрыл',
  'Толириб',
  'Агроспор',
  'Слюнис',
  'Пацарон',
  'Орангер',
  'Полиста',
  'Ассоса',
  'Приманус',
  'Ультрасон',
  'Инфрасон',
  'Диапазавр',
  'Дав-Чи',
  'Толко-Чи',
  'Фокут',
  'Дезистон',
  'Кнос',
  'Кноель',
  'Бугибум',
  'Метурнус',
  'Ферон',
  'Феронт',
  'Феромор',
  'Дзенос',
  'Омдзен',
  'Вольтон',
  'Амперон',
  'Плюш',
  'Минуш',
  'Гловер',
  'Гловия',
  'Астрания',
  'Кислипс',
  'Зевотл',
  'Зубанья',
  'Клыкула',
  'Литотик',
  'Рипогит',
  'Огнесёл',
  'Вулкемел',
  'Тортуфа',
  'Шмызг',
  'Мигроат',
  'Иври',
  'Зубант',
  'Зуоза',
  'Фасетон',
  'Пикан',
  'Пуникот',
  'Колди',
  'Облакас',
  'Мангусто',
  'Питонстр',
  'Лунарит',
  'Гелиорит',
  'Хрюгорь',
  'Сомасин',
  'Крак',
  'Клешираб',
  'Фатон',
  'Миражан',
  'Арсид',
  'Древнево',
  'Кафард',
  'Кафардор',
  'Тусклофиш',
  'Перламур',
  'Веттерино',
  'Колорон',
  'Джипер',
  'Крипер',
  'Мазинар',
  'Матод',
  'Пальмер',
  'Беллингер',
  'Багиррот',
  'Поркуш',
  'Снепург',
  'Снолинг',
  'Тюлон',
  'Снелень',
  'Моржонг',
  'Остер',
  'Жемчул',
  'Туснейк',
  'Архфиш',
  'Серц',
  'Дракун',
  'Дракормор',
  'Драконор',
  'Ядрон',
  'Биядрон',
  'Полидрон',
  'Роколем',
  'Глалем',
  'Феролем',
  'Сурейя',
  'Фрейяс',
  'Делюжион',
  'Тьеррадон',
  'Астрофурия',
  'Дезастра',
  'Космотел',
  'Гроузи',
  'Орасин',
  'Грутортл',
  'Пламуар',
  'Пламиан',
  'Пламиафан',
  'Дельпи',
  'Дельфойл',
  'Ирродель',
  'Стриджи',
  'Стриджиа',
  'Стриджар',
  'Мабобр',
  'Боброн',
  'Лалабир',
  'Лалабибер',
  'Люкси',
  'Люэр',
  'Люэрион',
  'Бутастр',
  'Астрактус',
  'Скулкер',
  'Архаскулл',
  'Прадеф',
  'Архармор',
  'Битбаг',
  'Баллобаг',
  'Экофлай',
  'Хани',
  'Роялони',
  'Сквиспарк',
  'Аскал',
  'Ардыв',
  'Шерри',
  'Шерримп',
  'Сквооз',
  'Сквоозень',
  'Аббират',
  'Аэлит',
  'Аэролит',
  'Кролли',
  'Кронилла',
  'Амкриселла',
  'Картельер',
  'Пуркит',
  'Фурркит',
  'Белл',
  'Сниффи',
  'Сниффун',
  'Койн',
  'Колокойн',
  'Кустень',
  'Арлекид',
  'Гипохилси',
  'Йагупоп',
  'Шэдогос',
  'Сандус',
  'Сандул',
  'Сандулла',
  'Фетти',
  'Кунно',
  'Куннар',
  'Пескомот',
  'Пустыномот',
  'Жалоон',
  'Ядострел',
  'Кваяд',
  'Ядар',
  'Лопыш',
  'Термола',
  'Кетлфиш',
  'Плескайт',
  'Сапинсно',
  'Танненсно',
  'Девилот',
  'Полиселл',
  'Дэвилик',
  'Булавор',
  'Лознудль',
  'Вольтозавр',
  'Вулканозавр',
  'Ласкалас',
  'Бурдобаг',
  'Терралит',
  'Гласеолит',
  'Скорпетер',
  'Ленсирон',
  'LIG-29ec5',
  'Фемидон',
  'Дезимант',
  'Рондар',
  'Пургетта',
  'Барабаш',
  'Пенсила',
  'Сенсила',
  'Волила',
  'Хронокон',
  'Спасилион',
  'Вулкантрум',
  'Архолем',
  'Дудельена',
  'Лунария',
  'Аквон',
  'Аквилон',
  'Ноктурнус',
  'Траверисо',
  'Примарон',
  'Фламольга',
  'Випс',
  'Льернис',
  'Випертина',
  'Орфани',
  'Элембер',
  'Фудорар',
  'Дингвин',
  'Кикфлип',
  'Твинфин',
  'Крысуррил',
  'Сурикрыс',
  'Мимипёс',
  'Хмурпес',
  'Сербернос',
  'Пантир',
  'Пантигр',
  'Зеленос',
  'Зеленяма',
  'Краснос',
  'Красняма',
  'Голунос',
  'Голуняма',
  'Сонна',
  'Морфина',
  'Тукал',
  'Тукар',
  'Туказан',
  'Молняш',
  'Громмаш',
  'Гранни',
  'Гранатон',
  'Гранатрон',
  'Любокрыл',
  'Страстокрыл',
  'Лидрилл',
  'Дриллгрос',
  'Мулму',
  'Юниор',
  'Камесор',
  'Викториор',
  'Ренака',
  'Пантаран',
  'Сапантан',
  'Фат',
  'Брут',
  'Силкор',
  'Монторм',
  'Бомбимор',
  'Насбаг',
  'Рундер',
  'Асселида',
  'Стинни',
  'Вулли',
  'Бутита',
  'Камелиона',
  'Скулфиш',
  'Варк',
  'Даркан',
  'Бархаран',
  'Тотер',
  'Тотерин',
  'Фобрец',
  'Рокмит',
  'Скалмит',
  'Джидзю',
  'Джитсудзю',
  'Амфорёл',
  'Мумми',
  'Саркофагус',
  'Дреласт',
  'Аквартл',
  'Птарх',
  'Птархон',
  'Лутер',
  'Заммлер',
  'Ренур',
  'Ренуард',
  'Кларина',
  'Кларетта',
  'Айя',
  'Амайя',
  'Аюдайя',
  'Эмриоз',
  'Вакуолер',
  'Хромоцит',
  'Клюш',
  'Белебедь',
  'Пломби',
  'Брикетон',
  'Эскимур',
  'Мака',
  'Акама',
  'Вольтар',
  'Баубаг',
  'Кавалерон',
  'Пилцер',
  'Мускар',
  'Абимон',
  'Фундион',
  'Курара',
  'Элекс',
  'Электул',
  'Сталист',
  'Ставол',
  'Гиркс',
  'Тугир',
  'Гиротрон',
  'Клокс',
  'Такнун',
  'Три-о-Клокс',
  'Эон',
  'Уфон',
  'Виспи',
  'Виспокс',
  'Виловисп',
  'Мачетик',
  'Ачетон',
  'Гилионатор',
  'Айсхог',
  'Хеджайс',
  'Гласеокрис',
  'Пионор',
  'Инфантерон',
  'Грандинг',
  'Юн-До',
  'Юн-Фу',
  'Клодар',
  'Эстат',
  'Эстатуар',
  'Трапар',
  'Капканг',
  'Муйвол',
  'Аскай',
  'Бравиатор',
  'Шалли',
  'Робария',
  'Мурмофаг',
  'Мурмант',
  'Унозавр',
  'Диадонт',
  'Триораптос',
  'Инсакр',
  'Инсендора',
  'Свордал',
  'Шилдар',
  'Армаар',
  'Зефирал',
  'Бореал',
  'Солейон',
  'Оражион',
  'Нотал',
  'Турбилон',
  'Эпиар',
  'Каасандра',
  'Антифаг',
  'Паппинат',
  'Дэкорн',
  'Скордог',
  'Рарог',
  'Мифрит',
  'Вестлис',
  'Келпи',
  'Тенги',
  'Гиппотон',
  'Рарраб',
  'Диггод',
  'Ирлин',
  'Эмбервин',
  'Эмберлан',
  'Флешбаг',
  'Пыльцон',
  'Яркокрыл',
  'Фрыкон',
  'Прайдор',
  'Виспиора',
  'Нимфетта',
  'Дриадонна',
  'Голиф',
  'Голиафо',
  'Айлур',
  'Айлурот',
  'Перромаль',
  'Куарот',
  'Митадо',
  'Випон',
  'Амунир',
  'Реамунон',
  'Кензи',
  'Кокомисс',
  'Медёна',
  'Сласедь',
  'Топсин',
  'Тервин',
  'Анемон',
  'Рификус',
  'Ротенот',
  'Токсидра',
  'Ганидр',
  'Каннонидр',
  'Саннел',
  'Саннелен',
  'Динозябра',
  'Динодонт',
  'Люцея',
  'Люцеонус',
  'Фейрилит',
  'Ванакаури',
  'Волшбан',
  'Смарагд',
  'Пню',
  'Каугум',
  'Эластигон',
  'Кикип',
  'Трухля',
  'Трупень',
  'Гнилуша',
  'Гнилыква',
  'Льдинкус',
  'Айсбергус',
  'Носфер',
  'Носферат',
  'Фаринэль',
  'Даркаптус',
  'Снеколос',
  'Алманди',
  'Локиана',
  'Гейзерон',
  'Спайджи',
  'Кейджер',
  'Коффиндер',
  'Ракиф',
  'Тифун',
  'Пламерро',
  'Пульпи',
  'Пьеррог',
  'Сквидер',
  'Вуди',
  'Вудивинг',
  'Вудиатор',
  'Сурикот',
  'Суприкот',
  'Базз',
  'Баобазз',
  'Искразз',
  'Шретти',
  'Бигклоу',
  'Ауанула',
  'Миль',
  'Абемиль',
  'Зормень',
  'Квазор',
  'Шолфиш',
  'Шарпик',
  'Пойзонэлла',
  'Ишнак',
  'Версанд',
  'Баблбаг',
  'Рейнбаг',
  'Драценус',
  'Найрань',
  'Тенефил',
  'Тенефлор',
  'Бензящер',
  'Нефтеран',
  'Тедди',
  'Тед',
  'Беррини',
  'Бушбер',
  'Смородива',
  'Флорибри',
  'Деффенгутан',
  'Оффенгутан',
  'Вудлуз',
  'Вудлузиан',
  'Зыбун',
  'Оазост',
  'Вототайл',
  'Нуллион',
  'Аннигилон',
  'Кометор',
  'Слипанда',
  'Фуокуга',
  'Искрыш',
  'Лилюзьён',
  'Клыкорыб',
  'Фалькор',
  'Кочайуйо',
  'Гудзи',
  'Гудзила',
  'Гудзлион',
  'Стормгард',
  'Маггард',
  'Террагард',
  'Аквагард',
  'Лотри',
  'Лотриар',
  'Лотрублар',
  'Лотрунуар',
  'Фатумистон',
  'Бассинтол',
  'Басситамин',
  'Вайравир',
  'Антигравитон',
  'Грасюрикен',
  'Сваллозион',
  'Антиматерион',
  'Олимпиа',
  'Садшэдоу',
  'Пойсмос',
  'Космойзион',
  'Таутуррет',
  'Уранордия',
  'Молниора',
  'Амальгам',
  'Амальгетик',
  'Кокри',
  'Кокрис',
  'Кокорун',
  'Калфи',
  'Огнебиф',
  'Пиробул',
  'Дропи',
  'Каплис',
  'Капледроп',
  'Мутнис',
  'Карабсик',
  'Квиробаг',
  'Пухо',
  'Барабласт',
  'Угляш',
  'Гориясн',
  'Антрогор',
  'Токсичарк',
  'Электровайп',
  'Пировей',
  'Лавабаг',
  'Паранорм',
  'Полтеркот',
  'Глумбан',
  'Ноктуглум',
  'Ноктумаг',
  'Чаромол',
  'Колдумилк',
  'Ледец',
  'Элейрон',
  'Мастолит',
  'Арколид',
  'Фантолиск',
  'Фантодрейк',
  'Спиритвирм',
  'Вакон',
  'Конва',
  'Банди',
  'Бандор',
  'Маас',
  'Зонид',
  'Зоратор',
  'Воттад',
]
const setAutoSetting = new Set([
  'Волек',
  'Световол',
  'Мотль',
  'Коккон',
  'Москилл',
  'Орли',
  'Орлин',
  'Пискун',
  'Крыскун',
  'Дроздор',
  'Дроздун',
  'Ополоз',
  'Гюрзар',
  'Ваттон',
  'Кроттор',
  'Нинья',
  'Нинорьетта',
  'Ниньо',
  'Нинорино',
  'Эстерелла',
  'Ракода',
  'Джипсон',
  'Шумышь',
  'Шадо-Ли',
  'Грюмышь',
  'Клуббиш',
  'Амбрук',
  'Листотел',
  'Листвотел',
  'Редлик',
  'Шмелевик',
  'Потат',
  'Потатат',
  'Мукун',
  'Мурысь',
  'Малор',
  'Лемурил',
  'Огнепси',
  'Капель',
  'Водель',
  'Эни',
  'Рокиб',
  'Булли',
  'Буллит',
  'Каллея',
  'Цианея',
  'Скалоб',
  'Ураллер',
  'Эфон',
  'Флегон',
  'Дуоселл',
  'Октаселл',
  'Лутка',
  'Триодонт',
  'Нерп',
  'Слизень',
  'Грязень',
  'Шелтер',
  'Ост',
  'Аспер',
  'Рошер',
  'Ино',
  'Шримпер',
  'Злобстер',
  'Люминьон',
  'Бонозавр',
  'Скуллозавр',
  'Вупс',
  'Булавир',
  'Булаврон',
  'Хилси',
  'Вьюнудль',
  'Кугу',
  'Хорсилт',
  'Драуз',
  'Птерра',
  'Птеркус',
  'Скафиш',
  'Клошар',
  'Мантедж',
  'Дирбаг',
  'Элкас',
  'Сплешер',
  'Джорбик',
  'Мармаус',
  'Сивун',
  'Фоуль',
  'Лептибаг',
  'Кокцинус',
  'Рахнус',
  'Древень',
  'Дендино',
  'Камолино',
  'Грути',
  'Либеллёт',
  'Илполь',
  'Омутоль',
  'Месьер',
  'Унгну',
  'Кнурр',
  'Дуняш',
  'Скорпимер',
  'Битав',
  'Крачав',
  'Вартфиш',
  'Джуснель',
  'Демот',
  'Фоснейл',
  'Ленси',
  'Ленсерино',
  'Кореллик',
  'Рановак',
  'Меррипик',
  'Скайт',
  'Эмброзавр',
  'Лайкун',
  'Муваг',
  'Баттинун',
  'Баттнайти',
  'Корнис',
  'Голона',
  'Сивинг',
  'Сенс',
  'Спибаг',
  'Толириб',
  'Полиста',
  'Фокут',
  'Покут',
  'Ферон',
  'Дзенос',
  'Вольтон',
  'Гловер',
  'Гловия',
  'Астрания',
  'Зубанья',
  'Вулкемел',
  'Пикан',
  'Питонстр',
  'Сомасин',
  'Крак',
  'Тусклофиш',
  'Пальмер',
  'Поркуш',
  'Снепург',
  'Тюлон',
  'Снелень',
  'Остер',
  'Серц',
  'Лалабир',
  'Хани',
  'Кваяд',
  'Лопыш',
  'Термола',
  'Пантир',
  'Гранни',
  'Скулфиш',
  'Рокмит',
  'Лутер',
  'Заммлер',
  'Кларина',
  'Абимон',
  'Айсхог',
  'Хеджайс',
  'Грандинг',
  'Ирлин',
  'Фрыкон',
  'Айлур',
  'Кензи',
  'Медёна',
  'Анемон',
  'Ротенот',
  'Льдинкус',
])

const DEFAULT_VALUES = {
  numberAttack: '0', // Долже быть number
  criticalPP: '0', // Долже быть number
  criticalHP: '25', // Долже быть number
  variableShine: 'Не использовать', // супер убивать или ловить всех
  //
  // Монстр/атака для смены
  monsterSwapEnabled: false,
  monsterSwap: '',
  numberAttackSwap: '0',

  //
  // Монстр для прокачки
  monsterUp: '',
  attackUp: 'Замедленная бомба',
  maxLvl: '100',
  maxHighLvl: '', // отвечает за уровень на противнике
  lvlMaxEnabled: false,
  //
  //
  // Погода
  weatherLimitEnable: false,
  variableWeather: 'w3,w4',
  //
  // Поимка
  monsterCapture: '', // Либо пусто либо строка с id
  userCountCapture: '5',
  variableGender: 'Все',
  attackCapture: 'Сломанный меч',
  attackWeather: 'Не использовать',
  attackStatus: 'Колыбельная',
  monsterBall: '1',
  captureSemant: '',
  captureYarkokryl: '',
  //
  // Лимит монстров
  countMonsterLimit: '',
  monsterLimitEnable: false,
  //

  // Антибот
  variableAntiBot: 'alert',
  antiBotEnable: true,
  surrenderTrainer: false,
  //
  themeMode: '',
  //
  // Уведомления
  notification: false,
  // Хилки (через турАрену, через арену ЗД)
  tourHealEnabled: false,
  //Автойтемы
  autoItemEnable: false,
  variableItem: '',
  // Маршрут пользователя лечения
  spRoutHeal: [],

  // ЯД
  twoMonsterToxin: '',
  threeMonsterToxin: '',
  toxinEnabled: false,

  // Колючки
  firstMonsterSpike: '',
  twoMonsterSpike: '',
  threeMonsterSpike: '',
  spikesEnabled: false,
  // Автореклама
  userAd: '',
  autoAdEnable: false,

  // Автоостановка
  hourtimer: '00',
  minutetimer: '00',
  transferAll: false,
  autoStopEnabled: false,
}

class SettingsManager {
  constructor() {
    this.settings = {}
    this.initialized = false
    this.volatileKeys = new Set()
  }

  getFromStorage(key, defaultValue) {
    try {
      const value = localStorage.getItem(key)
      return value !== null ? JSON.parse(value) : defaultValue
    } catch {
      return defaultValue
    }
  }

  setToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      console.error('Ошибка хранилища:', e)
    }
  }

  init() {
    if (this.initialized) return this.settings

    for (const [key, defaultValue] of Object.entries(DEFAULT_VALUES)) {
      if (!this.volatileKeys.has(key)) {
        this.settings[key] = this.getFromStorage(key, defaultValue)
      }
    }

    this.initialized = true
    return this.settings
  }

  get(key, defaultValue) {
    if (!this.initialized) this.init()

    if (key in this.settings) return this.settings[key]
    return defaultValue
  }

  set(key, value, saveToStorage = true) {
    if (!this.initialized) this.init()

    this.settings[key] = value

    if (saveToStorage) {
      this.setToStorage(key, value)
    } else {
      this.volatileKeys.add(key) // ← автоматическая регистрация volatile ключа
    }
  }

  get(key, defaultValue) {
    if (!this.initialized) this.init()

    const value = this.settings[key]

    if (value === undefined || value === null || value === '') {
      return defaultValue
    }

    return value
  }

  saveCategoryToStorage(nameCategory, allMonsters) {
    const keyMap = {
      Редкие: 'monstersAll',
      Частые: 'monstersFight',
      Поймать: 'monstersCapture',
      Сдаться: 'monstersSurrender',
      Сменить: 'monstersSwitch',
      'Атака 1': 'monstersAttackOne',
      'Атака 2': 'monstersAttackTwo',
      'Атака 3': 'monstersAttackThree',
      'Атака 4': 'monstersAttackFour',
    }

    const key = keyMap[nameCategory]
    if (!key) {
      console.warn(`Нет ключа для категории: ${nameCategory}`)
      return
    }

    const set = allMonsters[nameCategory]
    if (!(set instanceof Set)) {
      console.warn(`Категория "${nameCategory}" не является Set`)
      return
    }

    this.setToStorage(key, [...set])
  }

  createReactiveSettings() {
    if (!this.initialized) this.init()

    const allKeys = new Set([...Object.keys(DEFAULT_VALUES), ...this.volatileKeys])

    const reactive = {}
    for (const key of allKeys) {
      Object.defineProperty(reactive, key, {
        get: () => this.get(key),
        set: (value) => this.set(key, value),
        enumerable: true,
      })
    }

    return reactive
  }
}

const settings = new SettingsManager()
settings.init()

const allMonsters = {
  Редкие: new Set(settings.getFromStorage('monstersAll', arrMonstersAll)),
  Частые: new Set(settings.getFromStorage('monstersFight', [])),
  Поймать: new Set(settings.getFromStorage('monstersCapture', [])),
  Сдаться: new Set(settings.getFromStorage('monstersSurrender', [])),
  Сменить: new Set(settings.getFromStorage('monstersSwitch', [])),
  'Атака 1': new Set(settings.getFromStorage('monstersAttackOne', [])),
  'Атака 2': new Set(settings.getFromStorage('monstersAttackTwo', [])),
  'Атака 3': new Set(settings.getFromStorage('monstersAttackThree', [])),
  'Атака 4': new Set(settings.getFromStorage('monstersAttackFour', [])),
}

let currentLocation = null
window.addEventListener('message', (event) => {
  if (event.source !== window) return

  if (event.data?.type === 'LOC_ID_UPDATE') {
    currentLocation = String(event.data.locId)
  }

  if (event.data?.type === 'init-data') {
    currentLocation = String(event.data.object.loc.id)
  }
})
class Button {
  constructor(options) {
    if (Array.isArray(options)) {
      return options.map((opt) => new Button(opt))
    }
    this.el = document.createElement('div')
    this.el.classList.add('menuItem')

    if (options.icon) {
      this.icon = this.createIcon(options.icon)
      this.el.prepend(this.icon)
    }
    if (options.red) {
      this.el.classList.add('red')
    }
    if (options.text) {
      this.el.append(options.text)
    }

    if (options.onClick) {
      this.el.addEventListener('click', (e) => {
        e.stopPropagation()
        options.onClick()
      })
    }
  }

  createIcon(iconClass) {
    this.icon = document.createElement('i')
    this.icon.classList.add(...iconClass.split(' '))
    return this.icon
  }
}

class CheckBox extends Button {
  constructor(options) {
    super(options)

    this.label = document.createElement('label')
    this.label.classList.add('toggle')

    this.input = document.createElement('input')
    this.input.type = 'checkbox'

    if (options.storage) {
      this.input.checked = settings.get(options.storage)
    }

    this.widget = document.createElement('span')
    this.widget.classList.add('slider')

    this.label.append(this.input, this.widget)
    this.el.append(this.label)

    this.el.addEventListener('click', (e) => {
      e.stopPropagation()
      this.input.checked = !this.input.checked
      this.input.dispatchEvent(new Event('change'))
    })

    this.input.addEventListener('change', () => {
      if (options.storage) {
        settings.set(options.storage, this.input.checked, !options.disable)
      }

      if (options.onChange) {
        options.onChange()
      }
    })
  }
}

class Input extends Button {
  constructor(options) {
    super(options)

    this.container = document.createElement('div')
    this.container.classList.add('input-container')

    this.iconContainer = document.createElement('div')
    this.iconContainer.classList.add('input-icon-container')

    this.fieldIcon = this.createIcon(`fa-light field icons-input-${options.number ? 'number' : 'text'}`)

    this.icon = this.createIcon('fa-light icons-xmark')

    this.input = document.createElement('input')
    this.input.classList.add('menu-input')
    this.input.type = 'text'
    this.input.name = options.storage
    this.input.autocomplete = 'off'

    if (options.storage) {
      this.input.value = settings.get(options.storage) || ''
    }

    if (this.input.value.length > 0) {
      this.icon.classList.add('visible')
    }

    if (options.placeholder) {
      this.input.placeholder = options.placeholder
    }

    if (options.number) {
      this.input.addEventListener('keydown', (e) => {
        const allowed = ['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab', 'Delete']
        if (!/\d/.test(e.key) && !allowed.includes(e.key)) {
          e.preventDefault()
        }
      })
    }
    if (options.width) {
      this.input.style.width = options.width
    }
    this.input.addEventListener('input', (e) => {
      e.stopPropagation()
      if (!options.noTrim) {
        this.input.value = this.input.value.trim()
      }
      if (this.input.value.length > 0) {
        this.icon.classList.add('visible')
      } else {
        this.icon.classList.remove('visible')
      }
      if (options.storage) {
        settings.set(options.storage, e.target.value)
      }
      if (options.onInput) {
        options.onInput(e.target.value)
      }
    })

    this.icon.addEventListener('click', (e) => {
      e.stopPropagation()
      this.input.value = ''
      this.icon.classList.remove('visible')
      if (options.storage) {
        settings.set(options.storage, '')
      }
      if (options.onInput) {
        options.onInput('')
      }
    })

    this.container.prepend(this.fieldIcon)
    this.iconContainer.append(this.icon)
    this.container.append(this.input, this.iconContainer)
    this.el.append(this.container)
  }
}

class Radio {
  constructor(options) {
    this.groupRadio = document.createElement('div')
    this.groupRadio.classList.add('radio-group')

    const group = options.group[0]
    const saved = settings.get(group.storage) || '0'

    options.options.forEach((option) => {
      const el = document.createElement('label')
      el.classList.add('radio-modal')

      const input = document.createElement('input')
      input.type = 'radio'
      input.name = group.name
      input.value = option.value
      input.classList.add('radio-input')
      input.checked = saved === option.value

      const radioMain = document.createElement('div')
      radioMain.classList.add('radio-main')

      const text = document.createElement('span')
      text.classList.add('radio-text')
      text.textContent = option.text

      el.addEventListener('click', (e) => {
        e.stopPropagation()
        input.checked = true
        settings.set(group.storage, option.value)
        if (options.onChange) {
          options.onChange(option.value)
        }
      })
      if (options.onChange) {
        input.addEventListener('change', (e) => {
          options.onChange(e.target.value)
        })
      }

      radioMain.append(text)
      el.append(input, radioMain)
      this.groupRadio.append(el)
    })
  }
}

class Menu {
  constructor(options) {
    this.el = document.createElement('div')
    this.el.classList.add('menu-container')

    this.backdrop = document.createElement('div')
    this.backdrop.classList.add('backdrop')

    this.menu = document.createElement('div')
    this.menu.classList.add('menu')

    this.menuHeader = document.createElement('div')
    this.menuHeader.classList.add('menu-header')

    this.menuTitle = document.createElement('span')
    this.menuTitle.classList.add('menu-title')
    this.menuTitle.textContent = options.title

    this.separator = document.createElement('div')
    this.separator.classList.add('hr')
    this.menu.append(this.menuHeader, this.separator)

    if (options.text) {
      this.text = document.createElement('span')
      this.text.classList.add('menu-text')
      const formattedText = options.text.replace(/\n/g, '<br>')
      this.text.innerHTML = formattedText
      this.menu.append(this.text)
    }

    this.content = document.createElement('div')
    this.content.classList.add('menu-content', 'custom-scroll')

    this.createItems(options.items)
    this.backdrop.addEventListener('click', () => {
      this.close()
    })
    this.modalRef = {
      close: () => this.close(),
    }
    ///

    this.menuHeader.append(this.menuTitle)
    this.menu.append(this.content)
    this.el.append(this.backdrop, this.menu)
  }

  createItems(items) {
    items.forEach((item) => {
      switch (item.type) {
        case 'checkbox':
          this.content.append(new CheckBox(item).el)
          break
        case 'input':
          this.content.append(new Input(item).el)
          break
        case 'radio':
          this.content.append(new Radio(item).groupRadio)
          break
        case 'viewHeal':
          this.content.append(new RouterViewHeal().container)
          break
        case 'timer':
          this.content.append(new TimePicker().container)
          break
        default:
          this.content.append(new Button(item).el)
          break
      }
    })
  }
  open() {
    document.body.appendChild(this.el)
    this.el.classList.remove('close')

    modalManager.register(this.modalRef)

    requestAnimationFrame(() => {
      this.el.classList.add('open')
    })
  }

  close() {
    this.el.classList.remove('open')
    modalManager.unregister(this.modalRef)

    requestAnimationFrame(() => {
      this.el.classList.add('close')
      setTimeout(() => {
        this.el.remove()
        this.el.classList.remove('close')
      }, 200)
    })
  }
}

class Monsters {
  constructor() {
    this.table = document.createElement('div')
    this.table.classList.add('table')

    this.header = document.createElement('div')
    this.header.classList.add('table-header')

    const searchInput = new Input({
      placeholder: 'Поиск монстра...',
      width: '140px',
      onInput: (value) => this.searchMonster(value),
    })

    const autosSetting = new Button({
      icon: 'fa-light icons-gear',
      text: 'Автонастройка',
      onClick: () => this.autoSetting(),
    })

    this.content = document.createElement('div')
    this.content.classList.add('table-content', 'custom-scroll')

    this.header.append(searchInput.el, autosSetting.el)
    this.table.append(this.header, this.content)

    this.categoryMap = {}
  }
  initCategories() {
    for (const [title, set] of Object.entries(allMonsters)) {
      const category = document.createElement('div')
      category.classList.add('category', 'custom-scroll')

      const header = document.createElement('div')
      header.classList.add('category-header')
      header.textContent = title

      const categoryContent = document.createElement('div')
      categoryContent.classList.add('category-content', 'custom-scroll')

      this.categoryMap[title] = categoryContent

      for (const monster of set) {
        const item = document.createElement('div')
        item.classList.add('category-item')
        item.textContent = monster

        categoryContent.append(item)
      }

      categoryContent.addEventListener('click', (e) => {
        const monster = e.target.closest('.category-item')
        if (!monster) return

        this.transferMenu(monster, title, categoryContent)
      })

      category.append(header, categoryContent)
      this.content.append(category)
    }
  }

  transferMenu(monsterEl, nameCategory) {
    const nameMonster = monsterEl.textContent

    const menu = document.createElement('div')
    menu.classList.add('switch-menu')

    const header = document.createElement('div')
    header.classList.add('switch-header')
    header.innerHTML = `Переместить <strong>${nameMonster}</strong> в:`

    const content = document.createElement('div')
    content.classList.add('switch-content')

    const backdrop = document.createElement('div')
    backdrop.classList.add('backdrop')

    for (const category of Object.keys(allMonsters)) {
      if (category === nameCategory) continue

      const btnSwitch = document.createElement('div')
      btnSwitch.classList.add('switch-item')
      btnSwitch.textContent = category

      content.append(btnSwitch)
    }

    this.modalRef = {
      close: () => {
        this.close(menu, backdrop)
        modalManager.unregister(this.modalRef)
      },
    }

    backdrop.addEventListener('click', () => this.modalRef.close())

    content.addEventListener('click', (e) => {
      const newCategoryName = e.target.closest('.switch-item')?.textContent
      if (!newCategoryName) return

      allMonsters[nameCategory].delete(nameMonster)
      allMonsters[newCategoryName].add(nameMonster)

      settings.saveCategoryToStorage(nameCategory, allMonsters)
      settings.saveCategoryToStorage(newCategoryName, allMonsters)

      this.categoryMap[newCategoryName].append(monsterEl)

      this.modalRef.close()
    })

    backdrop.append(menu)
    menu.append(header, content)
    this.table.append(backdrop)
    this.open(menu, backdrop)

    modalManager.register(this.modalRef)
  }
  open(menu, backdrop) {
    this.table.append(backdrop)

    requestAnimationFrame(() => {
      menu.classList.add('open')
    })
  }
  close(menu, backdrop) {
    requestAnimationFrame(() => {
      menu.classList.add('close')
      setTimeout(() => {
        menu.remove()
        backdrop.remove()
        menu.classList.remove('close')
      }, 150)
    })
  }
  autoSetting() {
    const rareSet = allMonsters['Редкие']
    const frequentSet = allMonsters['Частые']

    for (const monster of setAutoSetting) {
      if (rareSet.has(monster)) {
        rareSet.delete(monster)
      }
    }

    for (const [key, set] of Object.entries(allMonsters)) {
      if (key === 'Редкие') continue

      for (const monster of set) {
        if (setAutoSetting.has(monster)) {
          setAutoSetting.delete(monster)
        }
      }
    }

    for (const monster of setAutoSetting) {
      frequentSet.add(monster)
    }

    settings.saveCategoryToStorage('Редкие', allMonsters)
    settings.saveCategoryToStorage('Частые', allMonsters)

    const rareContainer = this.categoryMap['Редкие']
    rareContainer.innerHTML = ''
    for (const monster of rareSet) {
      const item = document.createElement('div')
      item.classList.add('category-item')
      item.textContent = monster
      rareContainer.append(item)
    }

    const frequentContainer = this.categoryMap['Частые']
    frequentContainer.innerHTML = ''
    for (const monster of frequentSet) {
      const item = document.createElement('div')
      item.classList.add('category-item')
      item.textContent = monster
      frequentContainer.append(item)
    }
  }

  searchMonster(val) {
    const query = val.toLowerCase()
    const containersWithMatches = new Map()

    for (const [_, container] of Object.entries(this.categoryMap)) {
      const items = container.querySelectorAll('.category-item')
      let firstMatch = null

      items.forEach((item) => {
        const isMatch = query && item.textContent.toLowerCase().includes(query)
        item.classList.toggle('found', isMatch)

        if (isMatch && !firstMatch) firstMatch = item
      })

      if (firstMatch) {
        containersWithMatches.set(container, firstMatch)
      }
    }

    for (const [_, matchEl] of containersWithMatches.entries()) {
      matchEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }
}

class ModalManager {
  constructor() {
    this.modals = []
  }

  /**
   * Регистрирует новый модал в стек.
   * @param {{ close: Function }} modalObj - объект модала с методом close()
   */
  register(modalObj) {
    if (!modalObj || typeof modalObj.close !== 'function') {
      console.warn('ModalManager.register: объект должен иметь метод close()')
      return
    }
    this.modals.push(modalObj)
  }

  /**
   * Убирает модал из стека.
   * @param {{ close: Function }} modalObj
   */
  unregister(modalObj) {
    const idx = this.modals.indexOf(modalObj)
    if (idx !== -1) {
      this.modals.splice(idx, 1)
    }
  }

  closeLast() {
    if (this.modals.length === 0) return
    const lastModal = this.modals[this.modals.length - 1]
    lastModal.close()
  }
}
const monstersObj = new Monsters()
const modalManager = new ModalManager()

monstersObj.initCategories()

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    modalManager.closeLast()
  }
})
const menuFight = new Menu({
  title: 'Бои',
  items: [
    {
      icon: 'fa-light icons-fight',
      text: 'Выбор атаки',
      onClick: () => menuAttack.open(),
    },
    {
      icon: 'fa-light icons-swap',
      text: 'Сменить/Добить',
      onClick: () => menuSwitch.open(),
    },
    {
      type: 'input',
      text: 'Лечится при HP% :',
      storage: 'criticalHP',
      width: '30px',
      number: true,
    },
    {
      type: 'checkbox',
      text: 'Добивание',
      storage: 'monsterSwapEnabled',
    },
    {
      icon: 'fa-light icons-gear',
      text: 'Настройка шайни/супер',
      onClick: () => menuShine.open(),
    },
    {
      icon: 'fa-light icons-toxin',
      text: 'Дроп яда Питонстра',
      onClick: () => menuToxin.open(),
    },
    {
      icon: 'fa-light icons-spike',
      text: 'Дроп колючек Пикан',
      onClick: () => menuSpike.open(),
    },
  ],
})
const menuShine = new Menu({
  title: 'Настройка шайни',
  text: 'Убивать: всех shine/super даже доступных для ловли.\n Ловить: всех shine/super доступных для ловли. \n Эта настройка приоритетнее таблицы!',
  items: [
    {
      type: 'radio',
      options: [
        { text: 'Убивать шайни/супер', value: 'Убивать' },
        { text: 'Ловить шайни/супер', value: 'Ловить' },
        { text: 'Не использовать', value: 'Не использовать' },
      ],
      group: [
        {
          name: 'variableShine',
          storage: 'variableShine',
        },
      ],
    },
  ],
})
const menuAttack = new Menu({
  title: 'Выбор атаки',
  items: [
    {
      type: 'radio',
      options: [
        { text: 'Атака 1', value: '0' },
        { text: 'Атака 2', value: '1' },
        { text: 'Атака 3', value: '2' },
        { text: 'Атака 4', value: '3' },
      ],
      group: [
        {
          name: 'numberAttack',
          storage: 'numberAttack',
        },
      ],
    },
  ],
})
const menuSwitch = new Menu({
  title: 'Сменить/Добить монстра',
  items: [
    {
      icon: 'fa-light icons-fight',
      text: 'Выбор атаки',
      onClick: () => {
        menuSwitchAttack.open()
      },
    },
    {
      type: 'input',
      text: 'Сменить на:',
      width: '80px',
      placeholder: 'id монстра',
      storage: 'monsterSwap',
    },
  ],
})
const menuSwitchAttack = new Menu({
  title: 'Выбор атаки',
  items: [
    {
      type: 'radio',
      options: [
        { text: 'Атака 1', value: '0' },
        { text: 'Атака 2', value: '1' },
        { text: 'Атака 3', value: '2' },
        { text: 'Атака 4', value: '3' },
      ],
      group: [
        {
          name: 'swapAttack',
          storage: 'numberAttackSwap',
        },
      ],
    },
  ],
})
const menuToxin = new Menu({
  title: 'Дроп яда Питонстра',
  text: 'Стартовый монстр должен быть с Семенами-пиявками.\n Второй и третий монстр будут меняться между собой.\n Рекомендуется использовать второго с Хабубом, третьего летающего монстра.',
  items: [
    {
      type: 'input',
      text: 'Второй монстр:',
      placeholder: 'id монстра',
      storage: 'twoMonsterToxin',
      width: '95px',
    },
    {
      type: 'input',
      text: 'Третий монстр:',
      placeholder: 'id монстра',
      storage: 'threeMonsterToxin',
      width: '95px',
    },
    {
      type: 'checkbox',
      text: 'Включить дроп яда',
      storage: 'toxinEnabled',
    },
  ],
})
const menuSpike = new Menu({
  title: 'Дроп колючек Пикан',
  text: 'Первый монстр должен быть с Отравлением, он может быть не стартовый!\n Второй и третий монстр будут меняться между собой.',
  items: [
    {
      type: 'input',
      text: 'Первый монстр:',
      placeholder: 'Пусто - текущим',
      storage: 'firstMonsterSpike',
      width: '110px',
    },
    {
      type: 'input',
      text: 'Второй монстр:',
      placeholder: 'id монстра',
      storage: 'twoMonsterSpike',
      width: '95px',
    },
    {
      type: 'input',
      text: 'Третий монстр:',
      placeholder: 'id монстра',
      storage: 'threeMonsterSpike',
      width: '95px',
    },
    {
      type: 'checkbox',
      text: 'Включить дроп колючек',
      storage: 'spikesEnabled',
    },
  ],
})
//
const menuMonster = new Menu({
  title: 'Монстры',
  items: [],
})
menuMonster.content.append(monstersObj.table)
//
const menuCapture = new Menu({
  title: 'Ловля',
  text: 'shine/super автоматический ловятся только на дарк/супер.',
  items: [
    {
      type: 'radio',
      options: [
        { text: 'Мальчик', value: 'Мальчик' },
        { text: 'Девочка', value: 'Девочка' },
        { text: 'Все', value: 'Все' },
      ],
      group: [
        {
          name: 'genderCapture',
          storage: 'variableGender',
        },
      ],
    },
    {
      type: 'input',
      text: 'Кем ловить id:',
      placeholder: 'Пусто - текущим',
      width: '120px',
      storage: 'monsterCapture',
    },
    {
      type: 'input',
      text: 'Сколько ловить:',
      number: true,
      placeholder: 'Количество',
      width: '80px',
      storage: 'userCountCapture',
    },
    {
      icon: 'fa-light icons-gear',
      text: 'Выбор атак',
      onClick: () => menuCaputerAttacks.open(),
    },
    {
      icon: 'fa-light icons-ball',
      text: 'Выбор монстроболла',
      onClick: () => menuMonsterBall.open(),
    },
    {
      icon: 'fa-light icons-spider',
      text: 'Поймать Яркокрыла или Семанта',
      onClick: () => menuSpecialCapture.open(),
    },
    //
  ],
})
const menuCaputerAttacks = new Menu({
  title: 'Выбор атак',
  text: 'Для монстров: Эни, Сенс первый монстр с Насмешкой.',
  items: [
    {
      icon: 'fa-light icons-fight',
      text: 'Атаки',
      onClick: () => menuCaptureAttack.open(),
    },
    {
      icon: 'fa-light icons-status',
      text: 'Статусная атака',
      onClick: () => menuStatus.open(),
    },
    {
      icon: 'fa-light icons-cloud',
      text: 'Погодная атака',
      onClick: () => menuCaptureWeather.open(),
    },
  ],
})
const menuCaptureAttack = new Menu({
  title: 'Атаки',
  items: [
    {
      type: 'radio',
      options: [
        { text: 'Блуждающие огни', value: 'Блуждающие огни' },
        { text: 'Семена-пиявки', value: 'Семена-пиявки' },
        { text: 'Сломанный меч', value: 'Сломанный меч' },
      ],
      group: [
        {
          name: 'attackCapture',
          storage: 'attackCapture',
        },
      ],
    },
  ],
})
const menuStatus = new Menu({
  title: 'Статусные атаки',
  items: [
    {
      type: 'radio',
      options: [
        { text: 'Колыбельная', value: 'Колыбельная' },
        { text: 'Споры', value: 'Споры' },
        { text: 'Парализующая пыльца', value: 'Парализующая пыльца' },
        { text: 'Насмешка', value: 'Насмешка' },
        { text: 'Блуждающие огни', value: 'Блуждающие огни' },
        { text: 'Семена-пиявки', value: 'Семена-пиявки' },
        { text: 'Не использовать', value: 'Не использовать' },
      ],
      group: [
        {
          name: 'status',
          storage: 'attackStatus',
        },
      ],
    },
  ],
})
const menuCaptureWeather = new Menu({
  title: 'Погодные атаки',
  items: [
    {
      type: 'radio',
      options: [
        { text: 'Танец дождя', value: 'Танец дождя' },
        { text: 'Ясный день', value: 'Ясный день' },
        { text: 'Не использовать', value: 'Не использовать' },
      ],
      group: [
        {
          name: 'variableAttackWeather',
          storage: 'attackWeather',
        },
      ],
    },
  ],
})
const menuMonsterBall = new Menu({
  title: 'Выбор монстроболла',
  items: [
    {
      type: 'radio',
      options: [
        { text: 'Монстробол', value: '1' },
        { text: 'Гритбол', value: '2' },
        { text: 'Мастербол', value: '3' },
        { text: 'Ультрабол', value: '4' },
        { text: 'Даркбол', value: '13' },
        { text: 'Супердаркбол', value: '18' },
        { text: 'Браконьера', value: '30' },
        { text: 'Люксбол', value: '5' },
        { text: 'Френдбол', value: '7' },
        { text: 'Лавбол', value: '9' },
        { text: 'Фастбол', value: '6' },
        { text: 'Трансбол', value: '16' },
        { text: 'Нестбол', value: '12' },
        { text: 'Багбол', value: '101' },
        { text: 'Блэкбол', value: '102' },
        { text: 'Электробол', value: '104' },
        { text: 'Файтбол', value: '105' },
        { text: 'Фаербол', value: '106' },
        { text: 'Флайбол', value: '107' },
        { text: 'Гостбол', value: '108' },
        { text: 'Грасбол', value: '109' },
        { text: 'Граундбол', value: '110' },
        { text: 'Айсбол', value: '111' },
        { text: 'Нормобол', value: '112' },
        { text: 'Токсикбол', value: '113' },
        { text: 'Псибол', value: '114' },
        { text: 'Стоунбол', value: '115' },
        { text: 'Стилбол', value: '116' },
        { text: 'Дайвбол', value: '117' },
        { text: 'Фейбол', value: '118' },
      ],
      group: [
        {
          name: 'ballCapture',
          storage: 'monsterBall',
        },
      ],
    },
  ],
})
const menuSpecialCapture = new Menu({
  title: 'Поймать Яркокрылов и Семантов',
  text: 'Указывать кого ловить через запятую.',
  items: [
    {
      type: 'input',
      text: 'Яркокрылы:',
      placeholder: 'номера',
      width: '100px',
      storage: 'captureYarkokryl',
    },
    {
      type: 'input',
      text: 'Семанты:',
      placeholder: 'буквы',
      width: '100px',
      storage: 'captureSemant',
    },
  ],
})
// //
const menuUp = new Menu({
  title: 'Настройка прокачки',
  items: [
    {
      type: 'radio',
      options: [
        { text: 'Замедленная бомба', value: 'Замедленная бомба' },
        { text: 'Крик банши', value: 'Крик банши' },
      ],
      group: [
        {
          name: 'attackUp',
          storage: 'attackUp',
        },
      ],
    },
    {
      type: 'input',
      text: 'Кого качать:',
      placeholder: 'id монстра',
      width: '95px',
      storage: 'monsterUp',
    },
    {
      type: 'input',
      text: 'До уровня:',
      number: true,
      placeholder: 'Пусто - 100 уровень',
      width: '130px',
      storage: 'maxLvl',
    },
    {
      type: 'input',
      text: 'Сдаваться напал выше:',
      placeholder: 'Пусто - не ограничивать',
      width: '160px',
      number: true,
      storage: 'maxHighLvl',
    },

    {
      type: 'checkbox',
      text: 'Включить прокачку',
      disable: true,
      storage: 'lvlMaxEnabled',
    },
  ],
})
//

//

const menuOther = new Menu({
  title: 'Дополнительно',
  items: [
    {
      icon: 'fa-light icons-cloud',
      text: 'Погода',
      onClick: () => menuWeather.open(),
    },
    {
      icon: 'fa-light icons-theme',
      text: 'Ночной режим',
      onClick: () => themeController.toggleTheme(),
    },
    {
      icon: 'fa-light icons-lock',
      text: 'Ограничение монстров',
      onClick: () => menuLimitMonster.open(),
    },
    {
      icon: 'fa-light icons-siren',
      text: 'Антибот',
      onClick: () => menuAntiBot.open(),
    },
    {
      icon: 'fa-light icons-repeat',
      text: 'Автоинвентарь',
      onClick: () => menuAutoItems.open(),
    },
    {
      icon: 'fa-light icons-clipboard-medical',
      text: 'Лечение',
      onClick: () => menuHeal.open(),
    },
    {
      icon: 'fa-light icons-ad',
      text: 'Автореклама',
      onClick: () => menuAutoAd.open(),
    },
    {
      icon: 'fa-light icons-alarm-stop',
      text: 'Автоостановка',
      onClick: () => menuAutoStop.open(),
    },
  ],
})
//

const menuWeather = new Menu({
  title: 'Настройка погоды',
  text: 'Останавливается только если идёт прокачка или поимка.',
  items: [
    {
      type: 'radio',
      options: [
        { text: 'Град', value: 'w3' },
        { text: 'Песчаная буря', value: 'w4' },
        { text: 'Град и Песчаная буря', value: 'w3,w4' },
      ],
      group: [
        {
          name: 'variableWeather',
          storage: 'variableWeather',
        },
      ],
    },
    {
      type: 'checkbox',
      text: 'Ограничение погоды',
      storage: 'weatherLimit',
    },
  ],
})
// //
const menuLimitMonster = new Menu({
  title: 'Ограничение монстров',
  text: 'Когда достигнет лимита монстров, бот прекратит работу.',
  items: [
    {
      type: 'input',
      placeholder: 'Количество монстров',
      width: '145px',
      storage: 'countMonsterLimit',
      number: true,
    },
    {
      type: 'checkbox',
      text: 'Ограничение монстров',
      disable: true,
      storage: 'monsterLimitEnable',
    },
  ],
})

//
const menuAntiBot = new Menu({
  title: 'Антибот',
  text: 'Сдаваться тренерам работает независимо \n выберите вы или нет активацию антибота.',
  items: [
    {
      type: 'radio',
      options: [
        { text: 'Пауза 5 минут', value: 'pause' },
        { text: 'Остановить', value: 'stop' },
        { text: 'Только уведомления', value: 'alert' },
      ],
      group: [
        {
          name: 'variableAntiBot',
          storage: 'variableAntiBot',
        },
      ],
    },
    {
      type: 'checkbox',
      text: 'Антибот',
      storage: 'antiBotEnable',
      onChange: () => {
        if (settings.get('antiBotEnable') === true) {
          new MessageManager().start()
        } else {
          new MessageManager().stop()
        }
      },
    },
    {
      type: 'checkbox',
      text: 'Сдаваться тренерам',
      storage: 'surrenderTrainer',
    },
  ],
})
const menuAutoItems = new Menu({
  title: 'Автоинвентарь',
  items: [
    {
      type: 'radio',
      options: [
        { text: 'Старая удочка', value: '145' },
        { text: 'Спиннинг', value: '146' },
        { text: 'Рыболовные сети', value: '147' },
        { text: 'Свисток', value: '235' },
        { text: 'Приманка', value: '183' },
        { text: 'Портативный генератор', value: '386' },
        { text: 'Фото Камелионы', value: '148' },
        { text: 'Самодельный сканер', value: '185' },
        { text: 'Ягодный сок', value: '186' },
        { text: 'Бутылка воды', value: '254' },
        { text: 'Большой запас воды', value: '255' },
        { text: 'Акваланг', value: '268' },
      ],
      group: [
        {
          name: 'variableItem',
          storage: 'variableItem',
        },
      ],
    },
    {
      type: 'checkbox',
      text: 'Использовать',
      disable: true,
      storage: 'autoItemEnable',
      onChange: () => {
        if (settings.get('autoItemEnable') === true) {
          autoItem.execute()
        } else {
          autoItem.stop()
        }
      },
    },
  ],
})
const menuAutoAd = new Menu({
  title: 'Реклама',
  items: [
    {
      type: 'input',
      storage: 'userAd',
      placeholder: 'Ваша реклама',
      noTrim: true,
      width: '200px',
    },
    {
      type: 'checkbox',
      text: 'Включить рекламу',
      storage: 'autoAdEnable',
      disable: true,
      onChange: () => {
        if (settings.get('autoAdEnable') === true) {
          autoAd.execute()
        } else {
          autoAd.stop()
        }
      },
    },
  ],
})
const menuAutoStop = new Menu({
  title: 'Автоостановка',
  items: [
    {
      type: 'timer',
    },
    {
      type: 'checkbox',
      text: 'Отправлять монстров в монстроцентр',
      storage: 'transferAll',
      disable: true,
    },
    {
      type: 'checkbox',
      text: 'Включить автоостановку',
      storage: 'autoStopEnabled',
      disable: true,
      onChange: () => {
        if (settings.get('autoStopEnabled') === true) {
          autoStop.execute()
        } else {
          autoStop.stop()
        }
      },
    },
  ],
})

const menuHeal = new Menu({
  title: 'Настройки лечения',
  items: [
    {
      icon: 'fa-light icons-route',
      text: 'Маршрут для лечения',
      onClick: () => {
        const modal = new CreateHeal()
        modal.createMenu()
        modalManager.register(modal)
      },
    },
    {
      type: 'checkbox',
      text: 'Лечиться через арену ЛЧ',
      storage: 'tourHealEnabled',
    },
  ],
})

const menuButtons = new Button([
  {
    icon: 'fa-light icons-fight',
    text: 'Атака',
    onClick: () => {
      toggleConfirmInterceptor(true), GameUtils.btnWild(true), bot.start()
    },
  },
  {
    icon: 'fa-light icons-heal',
    text: 'Хил',
    onClick: () => new HealAction().execute(),
  },
  {
    icon: 'fa-light icons-stop',
    text: 'Стоп',
    onClick: () => {
      bot.stop(), toggleConfirmInterceptor(false), GameUtils.btnWild(false)
    },
  },
  {
    icon: 'fa-light icons-gear',
    text: 'Бои',
    onClick: () => menuFight.open(),
  },
  {
    icon: 'fa-light icons-ball',
    text: 'Монстры',
    onClick: () => menuMonster.open(),
  },

  {
    icon: 'fa-light icons-lvlup',
    text: 'Прокачка',
    onClick: () => menuUp.open(),
  },
  {
    icon: 'fa-light icons-spider',
    text: 'Ловля',
    onClick: () => menuCapture.open(),
  },
  {
    icon: 'fa-light icons-bars',
    text: 'Остальное',
    onClick: () => menuOther.open(),
  },

  {
    icon: 'fa-light icons-list-drop',
    text: 'Дроп',
    onClick: () => containerDrop.classList.toggle('open'),
  },
  // {
  //   text: 'Тест',
  //   onClick: () => {
  //     autoStop.execute()
  //   },
  // },
])

const btnToggle = document.createElement('div')
btnToggle.classList.add('btnToggle')
btnToggle.addEventListener('click', () => {
  mainMenu.classList.toggle('open')
})

const mainMenu = document.createElement('div')
mainMenu.classList.add('mainMenu')
mainMenu.append(...menuButtons.map((button) => button.el))

const containerDrop = document.createElement('div')
containerDrop.classList.add('menuDrop')

const noneDrop = document.createElement('div')
noneDrop.textContent = 'Дроп отсутствует'

containerDrop.append(noneDrop)
mainMenu.append(containerDrop)

document.body.append(btnToggle, mainMenu)
class ThemeController {
  constructor() {
    this.systemTheme = settings.getFromStorage('systemTheme', false)
    this.nowTheme = null
  }

  init() {
    if (!this.systemTheme) {
      this.nowTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      settings.setToStorage('themeMode', true)
      settings.setToStorage('theme', this.nowTheme)
    } else {
      this.nowTheme = settings.getFromStorage('theme')
    }

    this.setTheme(this.nowTheme)
  }

  setTheme(theme) {
    document.body.classList.remove('theme-light', 'theme-dark')
    document.body.classList.add(`theme-${theme}`)
    settings.setToStorage('theme', theme)
    this.nowTheme = theme
  }

  toggleTheme() {
    const newTheme = this.nowTheme === 'dark' ? 'light' : 'dark'
    this.setTheme(newTheme)
  }
}

const themeController = new ThemeController()

themeController.init()
let routeHeal = []
async function fetchData() {
  const mainUrls = ['https://dce6373a41a58485.mokky.dev/healTwoVersion']
  const backupUrls = ['https://65f9a7ef3909a9a65b190bd2.mockapi.io/heal']

  const urls = [...mainUrls, ...backupUrls]

  for (const url of urls) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      routeHeal = data

      return
    } catch (err) {
      console.warn(`Не удалось загрузить с ${url}:`, err)
    }
  }

  console.error('Не удалось загрузить данные ни с одного из URL')
}
fetchData()

class HealAction {
  constructor() {
    this.observer = new BattleObserver()
    this.startLocation = document.querySelector('#divLocCenter #divLocTitleContainer #divLocTitleText').textContent
    this.target = document.querySelector('#divLoc #divLocGo')
    this.transfer = false
    this.transferAll = false
  }
  async execute(transfer = false, transferAll = false) {
    this.transfer = transfer
    this.transferAll = transferAll
    const btnId = `btnGo${currentLocation}`
    let selectedRoute = null

    function findRoute(routes) {
      for (const route of routes) {
        if (Array.isArray(route[0])) {
          for (const subRoute of route) {
            if (subRoute.includes(btnId)) {
              return route
            }
          }
        } else {
          if (route.includes(btnId)) {
            return route
          }
        }
      }
      return null
    }

    await GameUtils.btnWild(false)

    if (settings.get('tourHealEnabled')) return this.healAreaStage()

    selectedRoute = findRoute(settings.get('spRoutHeal').map((r) => r.route))

    if (!selectedRoute) {
      selectedRoute = findRoute(routeHeal)
    }

    if (!selectedRoute) {
      soundController.play('shine')
      showNotification('Лечение', 'Маршрут лечения не найден')
      return
    }

    if (Array.isArray(selectedRoute[0])) {
      return this.healTwoRoute([selectedRoute])
    } else {
      return this.healRoute([selectedRoute])
    }
  }

  async healRoute(route) {
    const to = route[0]

    let button = null
    // Вперёд (от i = 1, пропуская первый шаг)
    for (let i = 1; i < to.length; i++) {
      button = this.target.querySelector(`#${to[i]}`)
      button.click()
      if (!(await this.moveTo('/do/loc/go'))) return new AttackAction().execute(+settings.get('numberAttack'))

      await GameUtils.delayHeal()
      if (BattleState.isBattleActive()) await new SurrenderAction.execute()
    }
    // Лечение
    if (this.transferAll) return this.transferMonsterAll()
    await this.healStage()
    // Назад (в обратном порядке)
    for (let i = to.length - 2; i >= 0; i--) {
      button = this.target.querySelector(`#${to[i]}`)
      button.click()
      if (!(await this.moveTo('/do/loc/go'))) return new AttackAction().execute(+settings.get('numberAttack'))
      await GameUtils.delayHeal()
      if (BattleState.isBattleActive()) await new SurrenderAction.execute()
    }

    await GameUtils.btnWild(true)
  }
  async healTwoRoute(route) {
    const to = route[0][0]
    const back = route[0][1]

    let button = null
    // Вперёд (от i = 1, пропуская первый шаг)
    for (let i = 1; i < to.length; i++) {
      button = this.target.querySelector(`#${to[i]}`)
      button.click()
      if (!(await this.moveTo('/do/loc/go'))) return new AttackAction().execute(+settings.get('numberAttack'))
      await GameUtils.delayHeal()
      if (BattleState.isBattleActive()) await new SurrenderAction.execute()
    }
    // Лечение
    if (this.transferAll) return this.transferMonsterAll()
    await this.healStage()
    // Назад (фулл)
    for (let i = 0; i < back.length; i++) {
      button = this.target.querySelector(`#${back[i]}`)
      button.click()
      if (!(await this.moveTo('/do/loc/go'))) return new AttackAction().execute(+settings.get('numberAttack'))
      await GameUtils.delayHeal()
      if (BattleState.isBattleActive()) await new SurrenderAction.execute()
    }
    await GameUtils.btnWild(true)
  }
  // Внимание на инфекции
  async healStage() {
    if (this.transfer) await this.transferMonster()

    const btnHeal = document.querySelector('#divLocRight #divLocNpc .btnLocHeal')

    let wait = this.isHeal()
    btnHeal.click()
    await wait

    if (document.querySelector('#divAlerten .alerten.info .divContent')?.textContent === 'Лечение не требуется.') return

    wait = this.healing()
    document.querySelector('.divContext .divElements .divElement.menuHealAll').click()

    await wait

    if (document.querySelector('#divAlerten .alerten.getting.minus')) return
  }

  // Арена
  async healAreaStage() {
    if (!(await this.teleportArea())) return new AttackAction().execute(+settings.get('numberAttack'))
    if (this.transferAll) return this.transferMonsterAll()
    if (this.transfer) await this.transferMonster()

    let wait

    const btnsCompete = document.querySelectorAll('#divCompete .divCompetePanel .button.justicon')
    for (const el of btnsCompete) {
      if (el.querySelector('span.icon-more')) {
        wait = new BattleObserver().openMenuElements()
        el.click()
        break
      }
    }

    await wait

    wait = this.isHeal()
    const btnHeal = document.querySelector('.divContext .divElements .divElement')
    if (btnHeal?.textContent.trim() === 'Лечение монстров') {
      btnHeal.click()
    } else {
      return console.log('кнопки нет')
    }

    await wait

    if (document.querySelector('#divAlerten .alerten.info .divContent')?.textContent === 'Лечение не требуется.') {
      return this.teleportArea()
    }

    wait = this.healing()
    document.querySelector('.divContext .divElements .divElement.menuHealAll').click()

    await wait

    if (document.querySelector('#divAlerten .alerten.getting.minus')) await this.teleportArea()

    await GameUtils.btnWild(true)
  }
  async teleportArea() {
    document.querySelector('#divDockMenu .divDockIcons .divDockIn img[src*="diary"]').click()

    await this.openMenuDiary()

    const panel = document.querySelector('.divDockPanels .divDockPanelsContent .panel.paneldiary')
    const panelBtn = panel.querySelectorAll('.tabControls div')
    for (const el of panelBtn) {
      if (el.textContent.trim() === 'Турниры') {
        el.click()
        break
      }
    }

    await this.openMenuDiary()

    panel.querySelector('.tabContent.tournaments .btnTelep').click() // телепорт

    const btnTeleport = document.querySelector('.divContext .divElements .divElement')
    if (
      !btnTeleport ||
      (!btnTeleport.textContent.trim().includes('Арена Лиги Чемпионов') && !btnTeleport.textContent.trim().includes('Возврат на локацию'))
    ) {
      return false
    }

    btnTeleport.click()
    if (!(await this.moveTo('/do/loc/teleparena'))) return false

    return true
  }

  async openMenuDiary() {
    const container = document.querySelector('.divDockPanels .divDockPanelsContent')
    await this.observer.observe(
      'openDiary',
      container,
      { childList: true, subtree: true },
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0
    )
  }

  //
  async moveTo(url) {
    const movePromise = this.observer.observe(
      'move',
      this.target,
      { childList: true },
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0
    )

    const responsePromise = waitForXHR(url)

    const data = await responsePromise

    if (data.code === 400) {
      this.observer.disconnect('move')
      return false
    }

    await movePromise
    return true
  }
  async isHeal() {
    const container = document.querySelector('.divContext .divElements')

    return this.observer.observe(
      'isHeal',
      container,
      { attributeFilter: ['style'], attributes: true },
      (mutation) => mutation.type === 'attributes' && mutation.attributeName === 'style' && mutation.target.style.display !== 'none'
    )
  }
  async healing() {
    const container = document.querySelector('#divAlerten')

    return this.observer.observe(
      'healing',
      container,
      { childList: true },
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0
    )
  }
  //
  async transferMonster() {
    const openTeam = document.querySelector('.divDockIcons .divDockIn img[src*="team"]')
    openTeam.click()

    await this.waitMenuTeam()

    const monsters = document.querySelectorAll('.divDockPanels .panel.panelpokes .divPokeTeam .pokemonBoxCard')

    for (const m of monsters) {
      const transfer = +m.querySelector('.maincardContainer .toolbar .id').textContent.replace(/[^\d]/g, '')
      if (!arrCapture.includes(transfer)) {
        const btn = m.querySelector('.maincardContainer .button.justicon')
        btn.click()
        await GameUtils.delayFast()
      }
    }

    arrCapture.length = 0
    openTeam.click()
  }

  async transferMonsterAll() {
    const openTeam = document.querySelector('.divDockIcons .divDockIn img[src*="team"]')
    openTeam.click()

    await this.waitMenuTeam()

    const monsters = document.querySelectorAll('.divDockPanels .panel.panelpokes .divPokeTeam .pokemonBoxCard')
    for (const el of monsters) {
      if (el.querySelector('.minicardContainer .minicard .boxright .icon-star-fill').style.display === 'none') {
        const btn = el.querySelector('.maincardContainer .button.justicon')
        btn.click()
        await GameUtils.delayFast()
      }
    }
    openTeam.click()
  }

  async waitMenuTeam() {
    const menuTeam = document.querySelector('.divDockPanels .panel.panelpokes .divPokeTeam')
    return this.observer.observe(
      'waitTeam',
      menuTeam,
      { childList: true },
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0
    )
  }
}
class UseItemAction {
  constructor({ id, type = 'item' }) {
    this.id = id
    this.type = type // 'item' или 'ball'
    this.observer = new BattleObserver()
    this.selector = this.type === 'item' ? '.divDockPanelsContent .divItemList' : '.hint.hint-global .hintcontent'
    this.itemIcon = document.querySelector('.divDockIn img[src*="items.png"]')
  }

  async execute() {
    await this.openMenu()

    const found = await this.findAndUseItem()
    return found
  }

  async openMenu() {
    if (this.type === 'item') {
      this.itemIcon.click()
      await this.waitMenuOpen()
      await GameUtils.delayFast()
    } else {
      const ball = divVisioFight.querySelector('#divFightI .boxleft.antioverlaybug img')
      ball.click()

      await this.waitFightMenu()

      const useItemOption = Array.from(document.querySelectorAll('.divContext .divElement.clickable')).find(
        (el) => el.querySelector('.text')?.textContent === 'Использовать предмет...'
      )
      await GameUtils.delayFast()
      useItemOption?.click()
      await this.waitMenuOpen()
    }
  }

  async waitMenuOpen() {
    const target = document.querySelector(this.selector)
    return this.observer.observe(
      'waitUseItemPanel',
      target,
      { childList: true, subtree: true },
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0
    )
  }

  async waitFightMenu() {
    const divContext = document.querySelector('.divContext .divElements')
    return this.observer.observe(
      'waitFightMenu',
      divContext,
      { childList: true, subtree: true },
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0
    )
  }

  async findAndUseItem() {
    const container = document.querySelector(this.selector)

    const items = container.querySelectorAll('.item.clickable img')
    for (let img of items) {
      const itemId = img.getAttribute('src')?.split('/')[6]?.replace('.png', '')
      if (itemId === this.id) {
        const clickableItem = img.closest('.item.clickable')
        await this.use(clickableItem)
        return true
      }
    }
    // айтема нету
    return false
  }

  async use(itemElement) {
    if (this.type === 'item') {
      if (BattleState.isBattleActive()) {
        while (true) {
          if (!BattleState.isBattleActive()) break

          await new BattleObserver().waitForBattleOrMonsterChange()
        }
      }

      itemElement.click()
      const confirmButton = document.querySelector('.hint-global .button.withtext')
      confirmButton.click()
      // нужно проверить устновился или нет
      this.itemIcon.click()
    } else if (this.type === 'ball') {
      itemElement.click()
      this.itemIcon.click()
    }
  }
}

class AvtoItemAction {
  constructor() {
    this.isActive = false
    this.timer = null
    this.observer = new BattleObserver()
  }

  async execute() {
    if (this.isActive && this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.isActive = false

    await new Promise((resolve) => setTimeout(resolve, 50))

    this.isActive = true

    while (settings.get('autoItemEnable')) {
      const response = waitForXHR('/do/items/use')
      await this.useStage()
      const data = await response
      const timeout = data.object.txt.match(/\{\{i_effect_time:(\d+)\}\}/)?.[1]
      const noUse = data.object.success

      if (noUse) {
        if (timeout) {
          await this.createTimer(timeout)
        } else {
          await this.createTimer(3600)
        }
      }
    }

    this.isActive = false
  }

  async useStage() {
    await new UseItemAction({ id: `${settings.get('variableItem')}`, type: 'item' }).execute()
  }
  //
  async waitSuccess() {
    const container = document.querySelector('#divAlerten')
    return this.observer.observe(
      'waitSuccess',
      container,
      { childList: true },
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0
    )
  }

  //
  createTimer(timeout) {
    return new Promise((resolve) => {
      this.timer = setTimeout(() => {
        this.timer = null
        resolve()
      }, timeout * 1000)
    })
  }
  stop() {
    this.isActive = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
// Глобальный наблюдение за divAlerten

class DropController {
  constructor() {
    this.observer = null
    this.divAlerten = document.querySelector('#divAlerten')
    this.mapDrop = new Map()
  }

  start() {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.removedNodes.length === 0) {
          const el = mutation.addedNodes[0]

          if (el.matches('.getting.plus') || el.matches('.poke')) {
            this.format(el)
          }
        }
      }
    })

    this.observer.observe(this.divAlerten, {
      childList: true,
    })
  }

  stop() {
    this.observer.disconnect()
    this.observer = null
  }

  format(el) {
    const monster = el.querySelector('.wild .intextpoke')?.textContent || null
    const monsterCount = 1
    const items = el.querySelectorAll('.drop')

    const objMonster = { monster, monsterCount }
    let objDrop = {}

    for (const item of items) {
      const title = item.querySelector('.title').childNodes[0].textContent.trim()

      const count = +item.querySelector('.amount')?.textContent.replace(/\D/g, '') || 1

      objDrop[title] = count
    }

    this.addToContainer(objDrop, objMonster)
  }

  addToContainer(objDrop, objMonster) {
    for (const [itemName, count] of Object.entries(objDrop)) {
      if (this.mapDrop.has(itemName)) {
        const currentCount = this.mapDrop.get(itemName)
        this.mapDrop.set(itemName, currentCount + count)
      } else {
        this.mapDrop.set(itemName, count)
        this.createItem(itemName)
      }

      this.updateItem(itemName)
    }

    if (objMonster.monster) {
      const monsterName = objMonster.monster
      const monsterCount = objMonster.monsterCount

      if (this.mapDrop.has(monsterName)) {
        const currentCount = this.mapDrop.get(monsterName)
        this.mapDrop.set(monsterName, currentCount + monsterCount)
      } else {
        this.mapDrop.set(monsterName, monsterCount)
        this.createItem(monsterName)
      }

      this.updateItem(monsterName)
    }
  }

  createItem(itemName) {
    if (noneDrop && noneDrop.parentElement) {
      noneDrop.remove()
    }
    const itemDiv = document.createElement('div')
    itemDiv.className = 'drop-item'
    itemDiv.setAttribute('data-item', itemName)
    itemDiv.textContent = `${itemName} x${this.mapDrop.get(itemName)}`

    containerDrop.append(itemDiv)
  }
  updateItem(itemName) {
    const itemElement = containerDrop.querySelector(`[data-item="${itemName}"]`)
    if (itemElement) {
      const count = this.mapDrop.get(itemName)
      itemElement.textContent = `${itemName} x${count}`
    }
  }
}
const drop = new DropController()
drop.start()
class GameUtils {
  static async delayAttack() {
    return this.delay(300, 600)
  }
  static async delayFast() {
    return this.delay(200, 400)
  }
  static async delayHeal() {
    return this.delay(400, 700)
  }
  static async delay(minMs, maxMs) {
    const delayTime = Math.floor(Math.random() * (maxMs - minMs)) + minMs
    return new Promise((resolve) => setTimeout(resolve, delayTime))
  }

  static parsePercentage(element) {
    if (typeof element === 'string') {
      element = document.querySelector(element)
    } else {
      element = element
    }
    return parseFloat(element?.style.width) || 0
  }

  static getPPValues(attackElement) {
    const pp = attackElement?.querySelector('.divMoveParams')?.textContent || '0/0'
    const [current, max] = pp.split('/').map(Number)
    return { current, max }
  }
  static afterFight(attackElement) {
    const { current, max } = GameUtils.getPPValues(attackElement)
    const updatedPP = current - 1

    if (updatedPP <= +settings.get('criticalPP')) return new HealAction().execute()

    const hp = GameUtils.parsePercentage('#divFightI .progressbar.barHP div')
    if (hp <= +settings.get('criticalHP')) return new HealAction().execute()
  }
  static async btnWild(isActive) {
    //false отключить, true включить
    const btn = document.querySelector('#divInputButtons .btnSwitchWilds') || document.querySelector('#divDockUpper .btnSwitchWilds')
    if (isActive && !btn.classList.contains('pressed')) return btn.click()
    if (isActive && btn.classList.contains('pressed')) return
    if (!isActive && btn.classList.contains('pressed')) return btn.click()
    if (!isActive && !btn.classList.contains('pressed')) return
  }
}

class Player {
  get name() {
    return document.querySelector('#divFightI .pokemonBoxFight .title .name')?.textContent.trim() || ''
  }

  get hp() {
    return GameUtils.parsePercentage('#divFightI .progressbar.barHP div')
  }

  get isPlayer() {
    return !!document.querySelector('#divFightI .pokemonBoxDummy')
  }

  get availableAttacks() {
    return document.querySelectorAll('#divFightI .pokemonBoxFight .moves .moveBox .divMoveInfo.clickable')
  }
}
class Enemy {
  get name() {
    return document.querySelector('#divFightH .pokemonBoxFight .title .name')?.textContent.trim() || ''
  }
  get lvl() {
    return document.querySelector('#divFightH .pokemonBoxFight .boxleft .lvl')?.textContent.trim()
  }
  get hp() {
    return GameUtils.parsePercentage('#divFightH .progressbar.barHP div')
  }
  get gender() {
    return document.querySelector('#divFightH .pokemonBoxFight .title span')?.classList[3]
  }
  get isEnemy() {
    return !!document.querySelector('#divFightH .pokemonBoxDummy')
  }
}
//
class AttackManager {
  static DISABLED_ATTACKS = ['Сломанный меч', 'Подставной ход', 'Разнонаправленный ток']

  constructor(player) {
    this.player = player
    this.attack = null
  }

  findAttack(identifier) {
    const attacks = this.player.availableAttacks

    if (typeof identifier === 'number') {
      this.attack = attacks[identifier] || null
    }

    if (typeof identifier === 'string') {
      for (const a of attacks) {
        const title = a.querySelector('.divMoveTitle').textContent.trim()
        if (title === identifier) {
          this.attack = a
          break
        }
      }
    }

    if (!this.attack) {
      return { attack: null, actualAttack: null }
    }

    const { current } = GameUtils.getPPValues(this.attack)

    if (current <= +settings.get('criticalPP')) {
      let alternativeAttack = null

      for (const a of attacks) {
        const classList = a.classList
        const title = a.querySelector('.divMoveTitle').textContent.trim()
        const { current: aCurrent } = GameUtils.getPPValues(a)

        if (!classList.contains('category3') && !AttackManager.DISABLED_ATTACKS.includes(title) && aCurrent > +settings.get('criticalPP')) {
          alternativeAttack = a
          break
        }
      }

      return { attack: null, actualAttack: alternativeAttack }
    }

    return { attack: this.attack, actualAttack: null }
  }
}
class BattleObserver {
  constructor() {
    this.observers = new Map()
  }

  disconnect(key) {
    const observer = this.observers.get(key)
    if (observer) {
      observer.disconnect()
      this.observers.delete(key)
    }
  }

  cleanup() {
    this.observers.forEach((observer) => observer.disconnect())
    this.observers.clear()
  }

  observe(key, target, options, condition) {
    this.disconnect(key)

    if (!target) return Promise.resolve()

    return new Promise((resolve) => {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (condition(mutation)) {
            this.disconnect(key)
            resolve()
            break
          }
        }
      })

      observer.observe(target, options)
      this.observers.set(key, observer)
    })
  }

  waitForBattleUpdate() {
    const battleContainer = document.querySelector('#divFightI')

    return this.observe(
      'battleUpdate',
      battleContainer,
      { childList: true },
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0
    )
  }

  waitForMonsterChange() {
    const movesContainer = document.querySelector('#divFightI .moves')

    return this.observe(
      'monsterChange',
      movesContainer,
      { attributes: true, attributeFilter: ['class'] },
      (mutation) => mutation.type === 'attributes'
    )
  }

  async waitForBattleOrMonsterChange() {
    await Promise.race([this.waitForMonsterChange(), this.waitForBattleUpdate()])
  }
  async openMenuElements() {
    const conateiner = document.querySelector('.divContext .divElements')
    return this.observe(
      'menuOpen',
      conateiner,
      { childList: true, subtree: true },
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0
    )
  }
}
class BattleState {
  static isBattleActive() {
    const movesContainer = document.querySelector('#divFightI .moves')
    return !!movesContainer && movesContainer.style.display !== 'none'
  }

  static isAggressiveLocation() {
    return !!document.querySelector('#divFightData #divFightOptions .agro')
  }

  static getCurrentWeather() {
    const weatherIcon = document.querySelector('#divFightData #divFightWeather .iconweather')
    return weatherIcon?.classList || []
  }
  static async handleCriticalSituation() {
    if (BattleState.isAggressiveLocation()) {
      if (settings.get('monsterSwapEnabled') === true) {
        return new SwapAction().execute(true) // явно указать что в агро локации вызыва как критически
      }
      soundController.play('shine')
      showNotification('Внимание', 'Бот в ступоре')
      return
    } else {
      await new SurrenderAction().execute()

      return new HealAction().execute()
    }
  }
}
//
//
class SurrenderAction {
  async execute() {
    const buttons = Array.from(document.querySelectorAll('#divFightButtons .button'))

    const surrenderButton = buttons.find((btn) => btn.textContent.includes('Сдаться'))
    const closeButton = buttons.find((btn) => btn.textContent.includes('Закрыть'))

    if (surrenderButton && surrenderButton.style.display !== 'none') {
      surrenderButton.click()

      await new Promise((resolve) => {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.target === closeButton && mutation.attributeName === 'style') {
              observer.disconnect()
              resolve()
            }
          })
        })
        observer.observe(closeButton, { attributes: true })
      })

      await GameUtils.delayFast()
      closeButton.click()
    }
  }
}
class AttackAction {
  constructor() {
    this.attack = null
    this.actualAttack = null
    this.player = new Player()
    this.manager = new AttackManager(this.player)
  }

  async execute(identifier) {
    while (BattleState.isBattleActive()) {
      await GameUtils.delayAttack()

      if (this.player.hp <= +settings.get('criticalHP')) return BattleState.handleCriticalSituation()

      const result = this.manager.findAttack(identifier)

      this.attack = result.attack
      this.actualAttack = result.actualAttack
      ;(this.attack || this.actualAttack)?.click()

      await new BattleObserver().waitForBattleOrMonsterChange()
    }

    if (this.actualAttack) {
      return new HealAction().execute()
    }

    return GameUtils.afterFight(this.attack)
  }
}
//
class LevelUpAction {
  constructor() {
    this.player = new Player()
    this.enemy = new Enemy()
    this.manager = new AttackManager(this.player)

    this.attack = null
    this.actualAttack = null

    this.attempts = 0
    this.maxAttempts = 3

    this.lvlMonster = null

    this.data = null
  }
  async execute() {
    while (BattleState.isBattleActive() && this.attempts < this.maxAttempts) {
      if (this.player.hp <= +settings.get('criticalHP')) return BattleState.handleCriticalSituation()
      if (this.enemy.lvl >= +settings.get('maxHighLvl', 101)) return BattleState.handleCriticalSituation()

      const result = this.manager.findAttack(settings.get('attackUp'))

      this.attack = result.attack
      this.actualAttack = result.actualAttack

      await GameUtils.delayAttack()
      if (this.attack) {
        this.attack.click()

        const xhrPromise = waitForXHR('/do/pokes/load/list')

        await new BattleObserver().openMenuElements()

        this.data = await xhrPromise

        const monster = this.findMonster()
        if (!monster) return

        await GameUtils.delayAttack()
        monster.click()

        // await new BattleObserver().waitForBattleOrMonsterChange()
        const currentMonster = await this.currentMonster()

        if ((BattleState.isBattleActive() && currentMonster === +settings.get('monsterUp').replace(/[^\d]/g, '')) || this.player.isPlayer)
          return BattleState.handleCriticalSituation()

        this.attempts++
      } else {
        if (!this.actualAttack) {
          soundController.play('shine')
          showNotification('Прокачка', 'Отсутствует атака для прокачки')
        }
        this.actualAttack.click()

        // await new BattleObserver().waitForBattleOrMonsterChange()
        await waitForXHR('/do/fight/attack')
        this.attempts++
      }
    }
    if (this.actualAttack) {
      return new HealAction().execute()
    }
    return GameUtils.afterFight(this.attack)
  }

  findMonster() {
    const monsterSearch = +settings.get('monsterUp').replace(/[^\d]/g, '')
    console.log()

    if (!monsterSearch) {
      soundController.play('shine')
      showNotification('Прокачать', 'Указанного монстра с собой нет')
      return false
    }

    const numberMonster = this.data.object.findIndex((m) => m.id === monsterSearch)

    if (!numberMonster) {
      soundController.play('shine')
      showNotification('Прокачать', 'Указанного монстра с собой нет')
      return false
    } else {
      this.lvlMonster = this.data.object[numberMonster].lvl
    }

    const monsters = Array.from(document.querySelectorAll('.divContext .divElements .divElement.clickable'))

    const monster = monsters[numberMonster]

    if (this.lvlMonster >= +settings.get('maxLvl', 100)) {
      soundController.play('shine')
      showNotification('Прокачка', 'Уровень монстра достиг максимума')
      return false
    }

    if (parseFloat(monster.querySelector('.extra .progressbar.barHP div').style.width) <= +settings.get('criticalHP')) {
      BattleState.handleCriticalSituation()
      return false
    }
    return monster
  }
  async currentMonster() {
    const data = await waitForXHR('/do/fight/attack')
    const poke = data.object.side.I.poke

    return poke.id
  }
}
//
class SwapAction {
  constructor() {
    this.observer = new BattleObserver()
    this.attempts = 0
    this.maxAttempts = 3
  }

  async execute(lose = false) {
    while (this.attempts < this.maxAttempts) {
      if (await this.setMonster()) return new AttackAction().execute(+settings.get('numberAttackSwap'))

      await GameUtils.delayAttack()

      this.attempts++
    }

    if (this.attempts >= this.maxAttempts) {
      if (lose) {
        soundController.play('shine')
        showNotification('Сменить', 'Сменить не получилось')
      } else {
        return BattleState.handleCriticalSituation()
      }
    }
  }

  async setMonster() {
    if (!settings.get('monsterSwap')) {
      soundController.play('shine')
      showNotification('Сменить', 'Укажите монстра для смены')
      return false
    }

    const btnOpen = document.querySelector(' .divDockIcons .divDockIn img[src*="team"]')
    btnOpen.click()

    btnOpen.classList.remove('active')
    document.querySelector(' .divDockPanels').style.display = 'none'
    await this.waitMenuTeam()
    await GameUtils.delayFast()

    const monsters = document.querySelectorAll(' .divDockPanels .panel.panelpokes .divPokeTeam .pokemonBoxCard')
    for (const el of monsters) {
      if (
        el.querySelector('.maincardContainer .toolbar .id').textContent.trim().replace(/[^\d]/g, '') ===
        settings.get('monsterSwap').replace(/[^\d]/g, '')
      ) {
        el.querySelector('.maincardContainer .title .button.justicon').click()
        if (!(await this.waitSwitche())) return false
        return true
      }
    }

    soundController.play('shine')
    showNotification('Сменить', 'Монстр для смены отсутствует')
    return false
  }

  async waitMenuTeam() {
    const menuTeam = document.querySelector(' .divDockPanels .panel.panelpokes .divPokeTeam')
    return this.observer.observe(
      'waitTeam',
      menuTeam,
      { childList: true },
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0
    )
  }
  async waitSwitche() {
    const movePromise = this.observer.observe(
      'switche',
      document.querySelector('#divFightI'),
      { childList: true },
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0
    )

    const responsePromise = waitForXHR('/do/fight/switche')

    const data = await responsePromise

    if (data.code === 400) {
      this.observer.disconnect('switche')
      return false
    }

    await movePromise
    return true
  }
}

//
const arrCapture = []
class CaptureAction {
  static STATUS_SELECTORS = {
    Насмешка: '-840px 0px',
    Колыбельная: '-225px 0px',
    Споры: '-225px 0px',
    'Парализующая пыльца': '-180px 0px',
    'Блуждающие огни': '-120px 0px',
    'Семена-пиявки': '-210px 0px',
  }
  static WEATHER_SELECTORS = {
    'Танец дождя': '.iconweather.w1',
    'Ясный день': '.iconweather.w2',
  }
  static GENDER_SELECTORS = {
    Мальчик: 'icon-sex-1',
    Девочка: 'icon-sex-2',
    Все: 'icon-sex-3',
  }

  constructor() {
    this.observer = new BattleObserver()
    this.player = new Player()
    this.enemy = new Enemy()
    this.manager = new AttackManager(this.player)
    this.criticalHPEnemy = 30

    this.weatherAttack = null
    this.attackCapture = null
    this.statusAttack = null
    this.actualAttack = null

    this.foundBall = null
    this.tauntCounter = 0
    this.attempts = 0
    this.maxAttempts = 3

    this.isShine = false
    this.isSuper = false
  }

  async execute(isShine = false, isSuper = false, isYarkokryl = false) {
    this.isShine = isShine
    this.isSuper = isSuper
    this.isYarkokryl = isYarkokryl
    if (
      !this.isShine &&
      !this.isSuper &&
      settings.get('variableGender') !== 'Все' &&
      this.enemy.gender !== CaptureAction.GENDER_SELECTORS[settings.get('variableGender')]
    ) {
      return
    }

    if (arrCapture.length === 0) await this.blockTransfer()

    if (!(await this.setTaunt(true))) {
      if (!(await this.setMonster())) return
    }

    while (this.attempts < this.maxAttempts) {
      if (!(await this.weatherStage())) break
      if (!(await this.attackStage())) break
      if (!(await this.statusStage())) break
      if (!(await this.useItemStage())) break
    }
    if (!this.foundBall) {
      soundController.play('shine')
      showNotification('Поймать', 'Отсутствует монстробол')
      return
    }
    if (BattleState.isBattleActive()) {
      if (this.isShine || this.isSuper) {
        soundController.play('shine')
        showNotification('Поймать', 'Напал шайни/супер бот в ступоре')
        return
      }
      BattleState.handleCriticalSituation()
      return
    } else {
      if (this.actualAttack) return new HealAction().execute()
      if (settings.get('attackWeather') !== 'Не использовать') GameUtils.afterFight(this.weatherAttack)

      GameUtils.afterFight(this.attackCapture)
      GameUtils.afterFight(this.statusAttack)
    }
  }
  async weatherStage() {
    if (settings.get('attackWeather') === 'Не использовать') return true
    //
    while (true) {
      if (await this.setTaunt()) return true
      if (this.player.hp <= +settings.get('criticalHP')) return false

      const result = this.manager.findAttack(settings.get('attackWeather'))
      this.weatherAttack = result.attack
      this.actualAttack = result.actualAttack

      await GameUtils.delayAttack()

      if (this.weatherAttack) {
        const response = waitForXHR('/do/fight/attack')
        this.weatherAttack.click()
        await response
        // await new BattleObserver().waitForBattleOrMonsterChange()
        if (!BattleState.isBattleActive()) return false
        this.tauntCounter++
        if (await this.isWeatherActive()) return true
      } else {
        soundController.play('shine')
        showNotification('Поймать', 'Отсутствует погодная атака')
        return false
      }
    }
  }
  async attackStage() {
    while (true) {
      if (await this.setTaunt()) return true
      if (this.player.hp <= +settings.get('criticalHP')) return false
      if (this.enemy.hp <= this.criticalHPEnemy) return true

      const result = this.manager.findAttack(settings.get('attackCapture'))
      this.attackCapture = result.attack
      this.actualAttack = result.actualAttack

      await GameUtils.delayAttack()
      if (this.attackCapture) {
        const response = waitForXHR('/do/fight/attack')
        this.attackCapture.click()
        await response
        // await new BattleObserver().waitForBattleOrMonsterChange()
        if (!BattleState.isBattleActive()) return false
        this.tauntCounter++
        if (this.enemy.hp <= this.criticalHPEnemy) return true
      } else {
        soundController.play('shine')
        showNotification('Поймать', 'Отсутствует боевая атака')
        return false
      }
    }
  }
  async statusStage() {
    if (settings.get('attackStatus') === 'Не использовать') return true

    while (true) {
      if (await this.setTaunt()) return true

      if (this.player.hp <= +settings.get('criticalHP')) return false

      const result = this.manager.findAttack(settings.get('attackStatus'))
      this.statusAttack = result.attack
      this.actualAttack = result.actualAttack

      await GameUtils.delayAttack()
      const response = waitForXHR('/do/fight/attack')
      if (this.statusAttack) {
        this.statusAttack.click()
        await response
        // await new BattleObserver().waitForBattleOrMonsterChange()
        if (!BattleState.isBattleActive()) return false
        this.tauntCounter++

        if (await this.isStatusActive()) return true
      } else {
        soundController.play('shine')
        showNotification('Поймать', 'Отсутствует статусная атака')
        return false
      }
    }
  }
  async useItemStage() {
    if (await this.setTaunt()) return false
    if (!BattleState.isBattleActive()) return false

    let item = settings.get('monsterBall') //
    if (this.isShine) item = '13'
    if (this.isSuper) item = '18'
    if (this.isYarkokryl) item = '30'

    await GameUtils.delayAttack()
    this.foundBall = await new UseItemAction({ id: `${item}`, type: 'ball' }).execute()
    if (!this.foundBall) return false
    await new BattleObserver().waitForBattleOrMonsterChange()
    if (!BattleState.isBattleActive()) {
      this.hasCountCapture()
      return false
    }
    this.tauntCounter++
    this.attempts++

    return true
  }
  //
  async setTaunt(force = false) {
    if (!['Эни', 'Сенс'].includes(this.enemy.name)) return false

    if (!force && this.tauntCounter < 4) return false

    const result = this.manager.findAttack('Насмешка')
    const attack = result.attack

    if (!attack) {
      // намешки нету, может быть случайно
      if (this.isShine || this.isSuper) return false
      await new AttackAction().execute(+settings.get('numberAttack'))
      return false
    }

    await GameUtils.delayAttack()
    const response = waitForXHR('/do/fight/attack')
    attack.click()
    await response
    // await new BattleObserver().waitForBattleOrMonsterChange()

    this.tauntCounter = 0
    return true
  }

  //
  async isWeatherActive() {
    return !!document.querySelector(`#divFightWeather ${CaptureAction.WEATHER_SELECTORS[settings.get('attackWeather')]}`)
  }
  async isStatusActive() {
    const statusAll = document.querySelectorAll('#divFightH .statusimg')

    for (const el of statusAll) {
      if (el.style.backgroundPosition.trim() === CaptureAction.STATUS_SELECTORS[settings.get('attackStatus')]) return true
    }
    return false
  }
  //
  async waitMenuTeam() {
    const menuTeam = document.querySelector(' .divDockPanels .panel.panelpokes .divPokeTeam')
    return this.observer.observe(
      'waitTeam',
      menuTeam,
      { childList: true },
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0
    )
  }
  async setMonster() {
    if (!settings.get('monsterCapture')) {
      return true
    }

    const btnOpen = document.querySelector(' .divDockIcons .divDockIn img[src*="team"]')
    btnOpen.click()

    btnOpen.classList.remove('active')
    document.querySelector(' .divDockPanels').style.display = 'none'
    await this.waitMenuTeam()

    const monsters = document.querySelectorAll(' .divDockPanels .panel.panelpokes .divPokeTeam .pokemonBoxCard')

    for (const el of monsters) {
      if (
        el.querySelector('.maincardContainer .toolbar .id').textContent.trim().replace(/[^\d]/g, '') ===
        settings.get('monsterCapture').replace(/[^\d]/g, '')
      ) {
        const btnSet = el.querySelector('.maincardContainer .title .button.justicon')
        if (!btnSet) {
          const hp = GameUtils.parsePercentage(el.querySelector('.progressbar.barHP div'))

          if (hp <= +settings.get('criticalHP')) {
            BattleState.handleCriticalSituation()
            return false
          }
          return true
        }

        const response = waitForXHR('/do/fight/switche')
        btnSet.click()
        await response
        this.tauntCounter++
        return true
      }
    }

    soundController.play('shine')
    showNotification('Поймать', 'Монстр для поимки отсутствует')
    return false
  }

  async blockTransfer() {
    const btnOpen = document.querySelector(' .divDockIcons .divDockIn img[src*="team"]')
    const response = waitForXHR('/do/pokes/load/team')
    btnOpen.click()

    document.querySelector(' .divDockPanels').style.display = 'none'
    await this.waitMenuTeam()

    const data = await response

    arrCapture.push(...data.object.map((p) => p.id))

    btnOpen.click()
  }
  async hasCountCapture() {
    const btnOpen = document.querySelector(' .divDockIcons .divDockIn img[src*="team"]')
    btnOpen.click()

    document.querySelector(' .divDockPanels').style.display = 'none'

    await this.waitMenuTeam()

    const monsters = document.querySelectorAll(' .divDockPanels .panel.panelpokes .divPokeTeam .pokemonBoxCard').length
    const calc = monsters - arrCapture.length

    if (calc >= +settings.get('userCountCapture') || monsters === 6) {
      btnOpen.click()
      new HealAction().execute(true)
      return
    }
    btnOpen.click()
    return
  }
}
//

let countMonsterAll = 0
let countMonsterHour = 0
class BattleActionStrategy {
  constructor() {
    this.enemy = new Enemy()

    this.strategyMap = {
      Редкие: this.handleRareEncounter.bind(this),
      Частые: () => (settings.get('lvlMaxEnabled') ? this.levelUp.bind(this) : this.attack(+settings.get('numberAttack'))),
      Поймать: this.capture.bind(this),
      Сдаться: this.surrender.bind(this),
      Сменить: this.switchPokemon.bind(this),
      'Атака 1': () => this.attack(0),
      'Атака 2': () => this.attack(1),
      'Атака 3': () => this.attack(2),
      'Атака 4': () => this.attack(3),
    }
  }

  async execute() {
    const redMonster = !!document.querySelector(`#divFightH .trainerwild .wildinfo span`)?.classList.contains('rednumber') ?? false

    if (settings.get('surrenderTrainer')) {
      if (document.querySelector('#divFightH .pokemonBoxDummy')?.contains('trainer')) return new SurrenderAction().execute()
    }

    for (const [key, set] of Object.entries(allMonsters)) {
      let actualKey = key
      if (set.has(this.enemy.name)) {
        if (settings.get('vaiableShine') === 'Ловить' && !redMonster) {
          actualKey = 'Поймать'
        }

        if (key === 'Поймать') {
          if (redMonster && !this.enemy.name === 'Яркокрыл') {
            actualKey = 'Частые'
          }
          if (settings.get('vaiableShine') === 'Убивать') {
            actualKey = 'Частые'
          }
        }

        const strategy = this.strategyMap[actualKey]
        if (strategy) {
          if (settings.get('monsterLimitEnable') === true && Number(settings.get('countMonsterLimit')) <= countMonsterAll) {
            soundController.play('shine')
            showNotification('Лимит', 'Достигнут лимит монстров')
            return bot.stop()
          }
          // ДРОП ЯДА
          if (settings.get('toxinEnabled') && this.enemy.name === 'Питонстр' && redMonster) {
            countMonsterAll++
            return new dropSpecialAction().toxin()
          }
          if (settings.get('spikesEnabled') && this.enemy.name === 'Пикан' && redMonster) {
            countMonsterAll++
            return new dropSpecialAction().spike()
          }

          await strategy()
          countMonsterAll++

          return
        }
      }
    }

    throw new Error(`Неизвестное действие: ${this.enemy.name}`)
  }

  // Стратегии
  handleRareEncounter() {
    soundController.play('shine')
    showNotification('Редкий монстр', `Напал редкий монстр ${this.enemy.name}`)
    return
  }

  surrender() {
    return new SurrenderAction().execute()
  }

  async capture() {
    if (settings.get('weatherLimitEnable') === true) {
      if (
        settings
          .get('variableWeather')
          .split(',')
          .some((w) => w.trim() === BattleState.getCurrentWeather()[1])
      ) {
        soundController.play('shine')
        showNotification('Погода', 'Плохая погода, монстр не ловится.')
        return new AttackAction().execute()
      }
    }
    if (this.enemy.name === 'Яркокрыл') {
      const arr = settings.get('captureYarkokryl')?.split(',')

      const target = document.querySelector('#divFightH .pokemonBoxFight .minicardContainer .image img').src.match(/\/(\d+)_(\d+)\.png$/)[2]

      if (!arr?.includes(target)) return new AttackAction().execute()
      return new CaptureAction().execute(false, false, true)
    }

    const res = await this.isShine()
    if (res === 'super') {
      return new CaptureAction().execute(false, true)
    }
    if (res === 'shine') {
      return new CaptureAction().execute(true, false)
    }
    if (this.enemy.name === 'Семант') {
      const arr = settings.get('captureSemant')?.split(',')
      const obj = {
        а: '1',
        б: '2',
        в: '3',
        г: '4',
        д: '5',
        е: '6',
        ж: '7',
        з: '8',
        и: '9',
        й: '10',
        к: '11',
        л: '12',
        м: '13',
        н: '14',
        о: '15',
        п: '16',
        р: '17',
        с: '18',
        т: '19',
        у: '20',
        ф: '21',
        х: '22',
        ц: '23',
        ч: '24',
        ш: '25',
        щ: '26',
        ъ: '27',
        ы: '28',
        ь: '29',
        э: '30',
        ю: '31',
        я: '32',
      }

      const find = arr?.map((el) => obj[el])

      const target = document.querySelector('#divFightH .pokemonBoxFight .minicardContainer .image img').src.match(/\/(\d+)_(\d+)\.png$/)[2]
      if (!find?.includes(target)) return new AttackAction().execute()
    }
    return new CaptureAction().execute()
  }

  switchPokemon() {
    return new SwapAction().execute()
  }
  levelUp() {
    if (settings.get('weatherLimitEnable') === true) {
      if (
        settings
          .get('variableWeather')
          .split(',')
          .some((w) => w.trim() === BattleState.getCurrentWeather()[1])
      ) {
        soundController.play('shine')
        showNotification('Погода', 'Плохая погода, монстр не качается.')
        return new AttackAction().execute()
      }
    }

    return new LevelUpAction().execute()
  }
  attack(index) {
    return new AttackAction().execute(index)
  }

  async isShine() {
    const selector = document.querySelector(`#divFightH .maincardContainer .name`)

    const result = selector.classList.contains('shine2') ? 'super' : selector?.classList.contains('shine1') ? 'shine' : false

    return result
  }
}

class BattleBot {
  constructor() {
    this.observer = null
    this.isActive = false
    this.pauseTimer = null
    this.battleContainer = document.querySelector('#divFightH .trainerwild')
  }

  async start() {
    if (this.isActive) return

    this.isActive = true

    if (BattleState.isBattleActive()) {
      new BattleActionStrategy().execute()
    }
    this.setupBattleWatcher()
  }

  setupBattleWatcher() {
    const target = document.querySelector('#divVisioFight')
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          if (document.querySelector('#divFightLog').textContent === '') {
            new BattleActionStrategy().execute()
          }
          break
        }
      }
    })

    this.observer.observe(target, {
      attributeFilter: ['style', 'class'],
      attributes: true,
    })
  }

  stop() {
    if (!this.isActive) return
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
    this.isActive = false
  }

  pause() {
    this.stop()
    this.pauseTimer = setTimeout(() => {
      this.start()
    }, 5 * 60 * 1000)
  }
}
const bot = new BattleBot()
///

class dropSpecialAction {
  static STATUS_SELECTORS = {
    'Семена-пиявки': '-210px 0px',
    Отравление: '-195px -15px',
  }
  constructor() {
    this.attack = null
    this.firtsMonster = null
    this.twoMonster = null
    this.threeMonster = null
    this.player = new Player()
    this.manager = new AttackManager(this.player)

    this.observer = new BattleObserver()
  }
  async toxin() {
    if (this.player.hp <= +settings.get('criticalHP')) return BattleState.handleCriticalSituation()

    const result = this.manager.findAttack('Семена-пиявки')

    this.attack = result.attack
    if (!this.attack) return BattleState.handleCriticalSituation()
    this.attack?.click()

    await new BattleObserver().waitForBattleOrMonsterChange()

    this.firtsMonster = this.player.hp

    if (!(await this.isStatusActive('Семена-пиявки'))) return BattleState.handleCriticalSituation()

    await GameUtils.delayAttack()

    while (true) {
      let btnOpen = null
      let monsters = null
      btnOpen = document.querySelector(' .divDockIcons .divDockIn img[src*="team"]')
      btnOpen.click()

      btnOpen.classList.remove('active')
      document.querySelector('.divDockPanels').style.display = 'none'

      await this.waitMenuTeam()

      monsters = document.querySelectorAll('.divDockPanels .panel.panelpokes .divPokeTeam .pokemonBoxCard')

      for (const el of monsters) {
        if (
          el.querySelector('.maincardContainer .toolbar .id').textContent.trim().replace(/[^\d]/g, '') ===
          settings.get('twoMonsterToxin').replace(/[^\d]/g, '')
        ) {
          const btnSet = el.querySelector('.maincardContainer .title .button.justicon')
          if (!btnSet) {
            await new SurrenderAction().execute()
            return new HealAction().execute()
          }
          const response = waitForXHR('/do/fight/switche')
          btnSet.click()
          await response
          break
        }
      }

      if (!BattleState.isBattleActive()) {
        if (this.firtsMonster <= +settings.get('criticalHP')) return new HealAction().execute()
        return GameUtils.afterFight(this.attack)
      }

      await GameUtils.delayAttack()
      btnOpen = document.querySelector(' .divDockIcons .divDockIn img[src*="team"]')
      btnOpen.click()

      btnOpen.classList.remove('active')
      document.querySelector(' .divDockPanels').style.display = 'none'
      await this.waitMenuTeam()

      monsters = document.querySelectorAll(' .divDockPanels .panel.panelpokes .divPokeTeam .pokemonBoxCard')
      for (const el of monsters) {
        if (
          el.querySelector('.maincardContainer .toolbar .id').textContent.trim().replace(/[^\d]/g, '') ===
          settings.get('threeMonsterToxin').replace(/[^\d]/g, '')
        ) {
          const btnSet = el.querySelector('.maincardContainer .title .button.justicon')
          if (!btnSet) {
            await new SurrenderAction().execute()
            return new HealAction().execute()
          }
          const response = waitForXHR('/do/fight/switche')
          btnSet.click()
          await response
          break
        }
      }
      if (!BattleState.isBattleActive()) {
        if (this.firtsMonster <= +settings.get('criticalHP')) return new HealAction().execute()
        return GameUtils.afterFight(this.attack)
      }

      await GameUtils.delayAttack()
    }
  }
  async spike() {
    while (true) {
      if (this.player.hp <= +settings.get('criticalHP')) return BattleState.handleCriticalSituation()

      if (settings.get('firstMonsterSpike')) {
        if (!(await this.setMonster())) return
      }

      this.firtsMonster = this.player.hp

      if (this.firtsMonster <= +settings.get('criticalHP')) return BattleState.handleCriticalSituation()

      const result = this.manager.findAttack('Отравление')

      this.attack = result.attack
      if (!this.attack) return BattleState.handleCriticalSituation()
      this.attack?.click()

      await new BattleObserver().waitForBattleOrMonsterChange()

      this.firtsMonster = this.player.hp

      if (await this.isStatusActive('Отравление')) break

      await GameUtils.delayAttack()
    }

    while (true) {
      let btnOpen = null
      let monsters = null
      btnOpen = document.querySelector(' .divDockIcons .divDockIn img[src*="team"]')
      btnOpen.click()

      btnOpen.classList.remove('active')
      document.querySelector('.divDockPanels').style.display = 'none'

      await this.waitMenuTeam()

      monsters = document.querySelectorAll('.divDockPanels .panel.panelpokes .divPokeTeam .pokemonBoxCard')

      for (const el of monsters) {
        if (
          el.querySelector('.maincardContainer .toolbar .id').textContent.trim().replace(/[^\d]/g, '') ===
          settings.get('twoMonsterSpike').replace(/[^\d]/g, '')
        ) {
          const elementHP = el.querySelector('.minicardContainer .progressbar.barHP div')
          this.twoMonster = GameUtils.parsePercentage(elementHP)

          const btnSet = el.querySelector('.maincardContainer .title .button.justicon')
          if (!btnSet) {
            await new SurrenderAction().execute()
            return new HealAction().execute()
          }
          // const response = waitForXHR("/do/fight/switche")
          btnSet.click()
          // await response
          await new BattleObserver().waitForBattleOrMonsterChange()
          break
        }
      }

      if (!BattleState.isBattleActive()) {
        if (this.firtsMonster <= +settings.get('criticalHP')) return new HealAction().execute()
        if (this.twoMonster <= +settings.get('criticalHP')) return new HealAction().execute()
        return GameUtils.afterFight(this.attack)
      }

      await GameUtils.delayAttack()
      btnOpen = document.querySelector(' .divDockIcons .divDockIn img[src*="team"]')
      btnOpen.click()

      btnOpen.classList.remove('active')
      document.querySelector(' .divDockPanels').style.display = 'none'
      await this.waitMenuTeam()

      monsters = document.querySelectorAll(' .divDockPanels .panel.panelpokes .divPokeTeam .pokemonBoxCard')
      for (const el of monsters) {
        if (
          el.querySelector('.maincardContainer .toolbar .id').textContent.trim().replace(/[^\d]/g, '') ===
          settings.get('threeMonsterSpike').replace(/[^\d]/g, '')
        ) {
          const elementHP = el.querySelector('.minicardContainer .progressbar.barHP div')
          this.threeMonster = GameUtils.parsePercentage(elementHP)

          const btnSet = el.querySelector('.maincardContainer .title .button.justicon')
          if (!btnSet) {
            await new SurrenderAction().execute()
            return new HealAction().execute()
          }
          // const response = waitForXHR("/do/fight/switche")
          btnSet.click()
          // await response
          await new BattleObserver().waitForBattleOrMonsterChange()
          break
        }
      }
      if (!BattleState.isBattleActive()) {
        if (this.firtsMonster <= +settings.get('criticalHP')) return new HealAction().execute()
        if (this.twoMonster <= +settings.get('criticalHP')) return new HealAction().execute()
        if (this.threeMonster <= +settings.get('criticalHP')) return new HealAction().execute()
        return GameUtils.afterFight(this.attack)
      }

      await GameUtils.delayAttack()
    }
  }
  async setMonster() {
    const btnOpen = document.querySelector(' .divDockIcons .divDockIn img[src*="team"]')
    btnOpen.click()

    btnOpen.classList.remove('active')
    document.querySelector(' .divDockPanels').style.display = 'none'
    await this.waitMenuTeam()

    const monsters = document.querySelectorAll(' .divDockPanels .panel.panelpokes .divPokeTeam .pokemonBoxCard')
    for (const el of monsters) {
      if (
        el.querySelector('.maincardContainer .toolbar .id').textContent.trim().replace(/[^\d]/g, '') ===
        settings.get('firstMonsterSpike').replace(/[^\d]/g, '')
      ) {
        const btnSet = el.querySelector('.maincardContainer .title .button.justicon')
        const response = waitForXHR('/do/fight/switche')
        btnSet?.click()
        if (!btnSet) return true
        await response
        this.tauntCounter++
        return true
      }
    }

    soundController.play('shine')
    showNotification('Дроп шипов', 'Монстр отсутствует')
    return false
  }
  async waitMenuTeam() {
    const menuTeam = document.querySelector(' .divDockPanels .panel.panelpokes .divPokeTeam')
    return this.observer.observe(
      'waitTeam',
      menuTeam,
      { childList: true },
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0
    )
  }

  async isStatusActive(element) {
    const statusAll = document.querySelectorAll('#divFightH .statusimg')

    for (const el of statusAll) {
      if (el.style.backgroundPosition.trim() === dropSpecialAction.STATUS_SELECTORS[element]) return true
    }
    return false
  }
}
let meName = null

class SoundController {
  constructor() {
    this.sounds = {
      shine:
        "data:audio/mpeg;base64,SUQzBAAAAAIjHUFQSUMAAiBAAAAAaW1hZ2UvcG5nAAMAAIlQTkcNChoKAAAADUlIRFIAAAJYAAACWAgDAAAAibho7gAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAN4aVRYdFhNTDpjb20uYWRvYmUueG1wAAAAAAA8P3hwYWNrZXQgYmVnaW49Iu+7vyIgaWQ9Ilc1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCI/PiA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJBZG9iZSBYTVAgQ29yZSA1LjYtYzE0NSA3OS4xNjM0OTksIDIwMTgvMDgvMTMtMTY6NDA6MjIgICAgICAgICI+IDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+IDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdFJlZj0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlUmVmIyIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ9InhtcC5kaWQ6NjIxMGJmYmMtNzQyMS00YWUwLWFkMzAtMTE1NGI2OGY5ZWExIiB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOjI5MzMwMTAxMUQ1NDExRTlBQjUzOTA2NjFDMzNFNEQ2IiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjI5MzMwMTAwMUQ1NDExRTlBQjUzOTA2NjFDMzNFNEQ2IiB4bXA6Q3JlYXRvclRvb2w9IkFkb2JlIFBob3Rvc2hvcCBDQyAyMDE5IChNYWNpbnRvc2gpIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6OTY1MWIzYTYtNWQzYy00MjBlLTg2M2QtZjBjYjg1N2VhM2M5IiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOjYy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Ocbrq5RVz082dqYYbaBmKGFx4QarJ/oHh9Or4iegQwoEACElOJTfcDiQouwjh2n2eSnJs1sYj4/dvEiBbEUnffiKkjgipNJdt/YJzPUeEf+3Z/3SdyFiIGnsC4DJmiSehZEOklvn3pvScUR/kSGsJAAAJlG2Qu+DExtUizyzDpUVRkl6cbm3kBzoOPJKeUXWPzeoahKsosQbs1/Yoqkg3HVkWGWHgXZ+3K1zrTb//1jtPN1vz351Fcb6E///9vsJAAkQAAAgABEyaXUCIHMYIf0czAGOIJkhWYKNb2a+whgGTCYAAf8AqIBigwe0BgQGDQaBk0QNwABAiAivcFq4CxALDBcRgLm4DQYODFnAJBgICEXSHKDLxAfg2wEJARCguMFiYaIeOmJFS634jwQAFLlYOeFoAaMTRFln//uUROgAAqMx09MGK9BdxgpXYYNeCjSJU7TzAAFFDCnesJABCaOEW/i5g6MT2KWEEBOQpQV82WTJFSaKyS/8b5HikBcAyAfOITjLhygoAuoIomKSRNI//Jwc8g5PjmEUJwc8i5XIIRQqGKSRkiiYpJF5FEu//yDkXK/////6SRNGBZVm985GCgrmPwy/5rg0Ji8X4oKk9vZh8Dg6MroGAoLc8D5RgUpAElgM2SVAyRoDOrAMOyAx5QBYCF9eBhX4IUYLfQuiTIx3Az4oAIkDhYgQG9SFGNEFRZKXwBgogEGaAKjBgYLsLIXRPitR5Ge/BgIRsPoPQDNhYwGAg1cILF0hw5xDhmv4XVDjEtDdBhQHBhwCNj6y6ogRPkBX/iPzpHFUqEHHoi5MEwTJO66Lf/lwi5FzcihOGhFy+bkULhojpLoqmSKJj//J8vm/////6SRlTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uUROuABrtwy7ZugADSjhkwztAAAAABpBwAACAAADSDgAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
      message:
        "data:audio/mpeg;base64,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CGMaE/zPmjK2Qw0xeGo1/+yJKFicudJxv/1NQKDmkqiIZJbstxaV///g4IvJ+35UXhtCUg9M2Yjl///+yt44bch/2HpPTLWdxFctNW////9eqISyIfWsz5rDrRqJMOYlALuv7W/////1qMqj0qpMJh6JY12GqOJNaZ1VwhrH///////po68T+sOR+ak6Vj8OfVqxl/ZU/ztSmW2RKd/OM//4aAAAICAoDAHYZrKaexaL/PmBKiyXludZDxUYPK9EIT9AtVA1hQLJQbtVAKeAYYwGmDMCkQ1bwtFAsEGWGf/7lEToAAMFM9FlPWAAZUqaLKwgAFm9WyV5vQADBLhlUzVAABIaIV4N5Qy6McMuOQLJJkQqIKlL4aoE9E2sWsQsMsIWIaRU1R/KY3xvj5LJoLQZEWJk0FnDkkj/GGRgfO5sQ8fRaMmk0TJVIcTP+RQzLxsoh5WOksTJ4yUQIVsTJ4coxV/5mPbETFlCchvpJumm5NEyTpMqJogRigZIqL3/9NP/////SL1MQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7lGRRj/AAAGkHAAAIAAANIOAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==",
    }
    this.playing = false
  }

  async play(type) {
    if (this.playing) return
    if (meName === "Luxori") {
      this.sounds.message =
        "data:audio/mpeg;base64,SUQzAwAAAAABAVRYWFgAAAASAAAAbWFqb3JfYnJhbmQATTRBIABUWFhYAAAAEwAAAG1pbm9yX3ZlcnNpb24ANTEyAFRYWFgAAAAcAAAAY29tcGF0aWJsZV9icmFuZHMAaXNvbWlzbzIAVFNTRQAAAA4AAABMYXZmNjEuNy4xMDAAAAAAAAAAAAAAAP/7kAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEluZm8AAAAPAAABzQAC8kgAAwYICw0QExUXGx0fISUnKSwvMTQ2OTs+QENGSEpOUFJUWFpcX2JkZ2lsbnFzdnl7fYGDhYeLjY+SlZeanJ+hpKaprK6wtLa4ur7AwsXIys3P0tTX2dvf4ePn6evt8fP1+Pv9AAAAAExhdmM2MS4xOQAAAAAAAAAAAAAAACQGkQAAAAAAAvJIqFNkIQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7kGQAAAJKBtUdGGAANCMJsqGIABU5M19ZjAARBgsrfwUAAAACnJfERlkwcLAAQhgnB8HAQBAEAxLvKAmD75QH3/ggD78oCDvygIBj8CAg7g+D7/DAPg+D//lAxwfB8HwfAgIAgCEDg+D9CgQAAa/67u7iAAARN3cjc9AgGBgZz+RvkIBgZw+IDngmD78Mf9QIOM/+D4Ph93+7lwf/lwfD4AErQAAARSRbUkjdCXvjri159dit6RbiA4S+haERTVrpYVpQ3BMQLjfwOpS8lEBy1/IZtoeRdg8iiConaXbBSKDL1yVoXP0WVxxJXyri91PSW8Zh+o3Zxt2ozjd1dbLDcfeh16CvZyvX9/RfqH8J3lN25ykvfT73uhy5U7ruOqC/nlb/Wu43v5+WVukwy3ljl/5fGct77vPGeuWMrA8TKGgGKlWBUJCv4vSwMIAABpAAAAAAGi2t+AABXkIZHRxrchwDilWp90bIpuYIGTGak0DzGRqkgSIGA+k7ovnsRNYsjcvDZ8MMBIF1jUKkgkoAAABOSrcqZNxVslw5kCAbdf/7kmQKAgQlQtbvYeAGMGfayuCIAI9Iw1GtPQvIx4pq9BeIQoZoTSJtyH6gTkM7gNeVcmqqtIQlbVqNJPBXmirVPIwylOhs1Gw4Iw+laxwWiBm8TNt1xBnxI3RMX3XVvv/HxZZxbHjsEXGd4jRb/5+vjctNW+/ian1/akFvYaMMrvFfiWgNPCCvNyhe/+BT5OWU/pspCJIAAEywcVVcD9N019UcCNtmN2c2hWZG//dKMv//9PqXMqTNmaq6JOcMx8Odv//p4AICAFm3d9keDI2ON1LIHmHhwFrg6JTgLdwYZYU4vyq6VOlKqYgkyQbV8vFKi7AW1w/V7Kyk9DgVMFEZL8bwLssLYv3phShqpEssMFmw6ALFr9N8T5S8eToI9micmCqJv1FlU+x1WMq6JlxJ/Rv+ldY5///WIzOxPm7AgaYQAACcuHMSdVxK6I3Y5qM8qfX+NhQLu92wLKHsN4KuLCMAouf/EXKnf/Sn8VABtFWAAQAAAW6wYAlo5GIC4EG5cxi9JHhViYRDAEBJgc5hhRmUCZMbFXNNRvGmhoRtHEb/+5JkGAKEwDNO05lDci6C6jocRiqRzSU2bmBtyMmOJxgHpCDlDrMmYQIjc4A4TRqGAFQ+zHfaY3OIvu/JkTosMxReTZkzG0vS6rOW6uxR6dFetFInht/IX8uwzWdoFy0HJrzB6tNCxkTFVAdHVFzqswoyLZAm1+Ze0Fiv+7XP+3/dBLluaL4VvEFBWAACAAAJkg0YF1zvoO2CAbSo00oo2vUXV79Yw7vHOAAKhNG3Vb9m77rf+R///7bi5gup74LMdkkDHxIswWpTeM6MGgQDDsxIgTGgBQmDQLMYlKMp9pHF2FO32tMkDHIcEC1WoaEggF50n7l4PLGlNGOvE3CGIS6rToGlqg6GUujzzvHBEHyuG23xxwi2ow+kfo69yoD6TnxEQIJ3zzHf4yHYaAbLs96yWk3Jng+W6m3dO5VcvwYKjxPk0WiuEEAKAMI4QGKpLT5oewpz9ImjDqk5RKKMGaXYzIXOZwoZScu6AqpmM8byu+ZblntFEv9yVQAAHKMUVoDMcMyEtAxkYPdnmPoqDjAoYQGiIASMMHETGUEIF6dp//uSZBMABIdRzptvFpIvAzoaASYCE5VZYae9LfjIH2soJJcCbqMGaQ8icaKzgJ1xVMdXyfObc0j0JjBFb0fKNGx9H/aisI9lMmgFApAA3VfTrv3L3+pydSyIiRVQlQzJgmnPg4LqykHU+8x7wbqayJFvhAAtbTs5CqQhGb7Pyvv9/zIiJV9a8gN9Fi2zj4AABQAAN7AchF1AHINvFn7+36Uym9rTwpDcPe/dZrqjf6Qc6ylIot+sQJ3/b/zX0xsJFIEgIpSRYONrIORRKFSeRb0INE8K1FpAtr6PP9IKxTQ91UVXCUvERWj4BzoQfpcnC+2CDaVnJWVx2pbGn028qMv6fFsSLknX8VTGQuRdgBBKRkiD5P6gQPmzCHG8N5JQygLz/hWEBJKFdLF27UgpCaNF/4EbQrkmbpS0ckppnDIXaFC6pGayc0DNI+JFMI5MTQNoxNBG2Rt2XWJQTQFBucDhntXRfync6KnbK/bXO4XCQjaUxZ2T//RGOfOSZv9101P9G/cjfqMFThAVdYUCSAQAAVLYu9UeS5FQrbjQaSGGff/7kmQKgAQ6VddrDzN2MacafQTiepCY9UstJHqA0g0pOKGyiEyFrTmlDID0zMdytfNS7tWVwcoA+48BVnMqcq1PxNOWrSpAwA00OK5l8Gb4vnGNyoy2YKVkeEIXNw0XmuqPe6UqpxdZj9yBjpIBokIrlpSc++DgqOceacKNqmk59cx6kiZVFbSP79bzncOb2qxtokoS3AJFB0AEAAKgZp7FpPvWX0IPF+j0NTKVccFgFzhcuyNUtClWGP6qj0//X/6fQrYx6bxLAAAAAH47MERkmLOL0YIG9qo9QQHFwFUbJAphSZog8QjQkJksAKVM/cihYGyluS+xwtlfGBKViQbzsjdrCsnS8jtuqXFXkBQxgFjDqe61Gipoms2geToUQaVgdEqbiIaNYhy1N+QM5V/pTrFduofkNkiTuUoXbavgxsNHprW07IKFv1EgEAMAAsAAAAYH2Iz3UoLC6+aw7kDJDjcEJDE3B1yDmUASc3KkDOEIfEh4RVW/zybNYx9LR02q4AAAAAAADuDesVjpgiKNK60AKNnOsiC7DwoNhFTk+5j/+5JkEAZER1NSa3kTcDEDmhwsSVQRsM89TmhtyLwMaHSRpohgeRXX2jlB0DRpgT3NAj4WbS7rsoOwt+I0mSmqxFz0ZHng2mafMbeJ7bgoqjekhT1o/Uwel7OYYS+5TyzG7GYpMFEog9QTvDb93LDD1LqZWMMX3b6msUzppKytoVWpq7GVkshq60PcIowoAAAAAAgP5nIoIS8sEup/HQ1+A+YWC8ulNHRCtc0UZ9tQbJxR7+/quW8rRIX/+//RAAncEryABpLGLmQBRADgOYWLJ8AQAI4sQBCBCMoqaYITcZ4NLVhC9EJkyTytStrSgq+GkSmZCKF8RbpwIoxEuciOoMx5fEDLCu02Bui9lBhEfIQZigr8TL9SOdbqzW9eoIepqWv2/LcowlVYvh+y4qfXe9Im/LoVW/5P+K/ctlNm87Y3JMt9vYVl9+JLkwAAAKlAF55ReqAAMQgZlhQgzcyBw1ndu2Fp8HBEzXC5WcHRSqNel71+p/wN//1VAADm4bSHWCGskJoguJB5hJIZjdgYMUwEQ6b0ZiIErHtGVbjWW5pA//uSZBOORCA/zxt4QvI0oxnnMSZYEFzZOG08dojUjGaIF7AQvqn4xaGpsAskjKEnxgTdmkM/dx52ZxyHGtQfKpHWhD4p6ICEYort2ZzGKzYqYQG3USOSUDiI9zV8/Vx7va92jW7427n7l5p3/4ozT3+UzuoR55vfM1Ig6gDDPNyqgAAAngBvYsQsLwESa0ZCPkEYVg9adFh5yTRqCo6gZEUU03bG+scgN04AvQuntTY/3/nHrGF3BVKypWbb+OlEIAYJExhpw5IBChQ45ZBAx4qozQHodhxUzE2jq3XpG6Kwac6t6j4GGrBKAqljDBVFnJcDiPRQsanZA3wtAFCVgTJjTq9YVrIlX0u2ZPr8OM4VF0K7alUP7OrIhtfc2Q+g7HMfDL1kp/Rn4iPzQftdW8i4kE38/OftcAOANQg/zUOlIg2RSxGXic8Ze08vTRNK37L3zJDFa5xOWIz55tkrr6zPipYdu+eDr7Nn2f9aAABVwdNJtGQWMocQSDM2zPKkMmGhkYAAoUciJfBwALtr6hbXJbASMjiIS3XGDGoyKitql//7kmQaBAR3TE8bWELyNKL57SQmRBRZXVNMPYuQwaVrtCALQrOwMQxEEqJQMGWOwORTTGHkiu2mNeVAmI1zCtD8vs0oaE+HAoH4ODAHgAwSBwPFcafVzZG+6VHdS0yX6L86RD/ynNffHj6v7jWXuFl337rvtA8MTMgT9o5fvBAAAgAAAAEug/oKEbc0wG1coEEH5y+DhQSc4p3J2A1gBSjABn/EEwGQ+csn0ez//74IO3/+zEAAFN2yPjCIdBoTKVY7+A7z2zSaCQ5Y0oh5cm9aVhyMbOdaYZz+FtQmdQLphD+AMANdHjLH8yMj90xPIo9QjqNZl6Jv3CYU1nGJuWBIBuXCQOYVgENzM4ii+ElmdTORwHS9O+61epXx44s1+9Gzs/1+/zSGyyavzlOxgsbf5vBravWDlHaF7ojN9iJZfSeYR4vYX3ofr42KwsHjr7x4YbBdfcCEAAoAEOS4dyBy+uvtyE3+d//RFpbvMjL+9v/Jf1c51//5P0b/0+04d/AZV7Q+J13ciUAAXLv8HqsqolJaPUuf01JrQeDqWC4WM5//+5JkDYAEaFhaUyxJ9jUAyy0AIgCQGPdbrCS6SMKMaugRmho/WN/RYsbi19g5MkwUPMqMOUQL/sJtHoVe/Z4rO/Py2mAsIFAIi02pbIeZTmLBuOzYIIr3PFLR5nWFsRtDmrttsSeqmQOjLCr11GaefyZh/1VqzqS/TLRXCK5hZSPWDryiZK00sSyIkMEy1tHtbbFbaRICERgkAkN27ULVPADZ2m1fU1C2IPtQXd+oRn00b/5RBkLiQ8gHnHGTmhPjqxm+PYJDqTzia4CEAQAAAE9vE2RRVeaBy9i/qANnbQqYxjZvJXahmcg+dgWB7DRRZ7xOO0xFByIu6bbt2XXGaCEJ/Tsql76vjf+HWWqSuymLX7XIxCCZmTFTRIkT9eYAvPvrlZTZaPdhZazWq66lZB7yui7W2cSDVgb1+l+0GyiwVV+7e7Pp2+2NX0uoAAANWicR1WTtnrujBRqf8MyCHGepeJXQOIR60qEzk8f/pcWuE15DDXI11lXf/QrIhEpAAAlyTJkhz2chSZMejbErkiPTQOg4YiFMB4bQ6E3K1uPd//uSZBKA459XWOsPKvQ0hMoxCYKID1FTT6ywdIjDkehEsyDySRrl2QmPIuXsFsSXuraRYPe7pQmSHRrxYv9SlYWu6FFRAeLIJHX7WhgdF0OwsiuyOyGc0oduJK0xjqWpRubRKyk2c1W5urI/X/W/QytjygxBvBOwGyBGqcdsCPhFq2YUa48c3b0mx8Us1kV1PWhOLWahntda+13DCTSQrVid/yfMO12AAQAgAAAF3uhZYzMKMD7TtqKCHgDLNPfEWbVScZfSnNI/MpZfI5YsC2sYjsXUlStdRdOkJSfmiYSiCWUrIdDJ6oRBgfQPV2J8/YSMQYtyyAwFxzyVbGYU5xT0/M8un35zMi+0/pLb/0l9b9uuW2upR+nzkY9iNqCNM/SNFf4IMD+rFIcvlVXl2RcD0FCDzXCGBkNkB1T4e3oHQt5M8rf/e8qU3EEgCD39aP+yAAgAAAqX+gYTAoXkA5kzOOhzIWCOBNhx1jMab9X93CbcGajLZX9wstGY7FIUn6AlicUiyqpKeJECgqMsA8OE0zcdw6ppqJOKWKSs8EFh+f/7kmQniCO2V9NTSR0gMWTKKC0iTo9lQ0jtMHUAzZNosMMJoDzFmfWM/Y/Ig5fkdhHaCl+9dUpNfXvzyU8HdmOpy5mWQY59nz9ZjBoAAACjlfyixQTUKMTqmpx/jBdzZTI4iODiKfran8wu/CAAm0+v3Q96zI5xZGDXI//1wABBct2Mg2ACHY/ClqVYFpqyulfDg0pnmmupLLVRMCdicTeejljMSgbJJA2URRuH5sWajWHZ8Z0B4oqiwUha0uOL3qQb0ytFsNHduv5mPKv5MHyimzi10y6epn5hSfQrnYedINaSg4shfJqZ5Up5HmOtKc8+eY+UsTPjwAAcAB4E0+cTIZSJmvrgdDsWBb90qY3tqkXeglK/MpmdxR0M1kfV/TRuCuhLAMRwUd//TdCKRAJKbkbmn6sYHKUIrUijAkJntlmgCQrK4TiWZYMzVyh436k3b52tjc7fcZb2ksW53kMkMd8OVHQIMEQiJXsVDiHk/5hxayUtj8z/o3NvB2VFhUEVMK7SfcehaAURQYI7c+TA4AEAAAC1AETtQdcBD8SWe1z/+5JkOwADIjZWUwwa9DYlSk0F4xoTWVtK7DB6SMUVKrwXlMDo9GN/LniKGUULfXYcoHq+JbaLv7Ff8vOnwmOI9cfz0caHP/1QYAAAJnhlXBKw9KDcKTR+JJLwUCXIIarLaKkkagVXagRxkWHfFCB0B4DBggjstaaZAxfxfixwpBMtrpfRHCUMotioYfdd4FSRJYq9nte+Ptjig6BIEwbDmfiWtORHHBYdvFwcBJZjfVsz8UKoFNRHJ5F+UcjDmTu4QAQjKhxy4AI+7pz4X+iEXuIlQn10ABECIAZBAQAsQjQW84SAUBAAiAEu6BymMxolindJVrSSpG3ly+qmkI/RUVateS6oulKbW3EgSZdgh8nT8/JqBUgAAAEpzN6pICSWfLyRwFwysROa0AFgd0XDSJYDqrDytsiljMwE3Vfabfjku1LWuuqks8iEojQogojEsUz6IRENJEaFYmJiGERsSx/CyzbEIHaXUTCpAAnkEvKR29n37saqwpmPXM2AjVbGUvn1YZ/Pmuwqifqn/Mts6EgJAQBIAgACALB1ookE0T55//uSZEaCA/FMVdMpHaYyxHp+CaU2EDzLTU1hK8DQD2modYoY8dxAWwnnCRMnT4s6KLhYTL8rlZEzyZ2dWRxZNplbf6t2Z0xEAQABctslgEiuYp+wN0YWYmSiU8L3B28ugxdkCupZD0MppRGICOp44+LuLvWnGsnbb2SQTQIQP7GIpYcp/ktnXtRlvHNn6aGovHYgzxVC3Ehja74lWvQwRVNPYxQ7aYrQdlKr++4yz7/3BVQklEhMMAU6eLCBaxxbWEsVLVTxilyolAAwAMECYDisuUQHUxgFJ1oJGgJW+T/v6ZPjaT4LgBB+mzbnKgAu6iXKRb89/K4zZQFIelqAAAALl0QQ8R3MEPB2d5ZQNRSaW09Rc4FEv3TTa8fpoAQGwx4iFniEtMhlVMonPNaeNrMOPCi+rDan19U3Yi0W1SFMVBQUTFMrZQhJeYXvIVb1nEVxIJ157YpsjjZPKv5dcmLubcnc+Ef604GkvI9znz7527N3n/5Pf6n+hjJwAAAABF4DrDwNxQHyeSNX5dtvKNjEARoNdCouPIOugum6wmvJ5P/7kmRSAkPyV1I7TB4QMyRaOiAjwg/s8UVNsHTIyRGoiPMNOFjFAZ5aA0GlO/p/ZRJQAAgTNUMnhMACTAFoz8CjoVBjEphHJgqjxibkLBUif5QCm9VBNt6HFRkDBlcz7yUMUn/gVZI4tCEV3T4SI4lZGKRagQwlDAlLUdVkqGcZVsIVq3pZdRQA7OVGIl1IhSoPPMlTvE+3vP++XPBTdu9fL783yMxsLGs4Yf3wrm6/ZAOwPmhsO2vZGXOHaKWGRqLE++EPwJWeUcP2Xc4qbCWmLTUnLnJ+XnbAEWASBu19/7vrAALkqAqImOB5pf0EFCSLcDjyo3YIMQCGZGFs40IOWkAYCFtzd9gxjoAy6DBkaDh92FY0dgMVRiFoMtfvNSir9rndeKv3FKBw6OHoCUdpaGt8N0Dv51o0EbnLLyvYszz65bn4n5roas1VfaDP7+x2d/iSXZ8tqujKV6dJ6vL+vqwJAy9hEtnnKtQntbiMpUPGsaASIlANG1Due0yzoJjcOsznpIukFVbURa4Aq9oEyrh+3/KwrKIFDI/Sun11kBn/+5JkX4qETklOk2wWoDNjueA9Jj4QiL0+zeHnkMeL6Gi0jGCCguIsOMTKBKIZEkaBLUubA44I4STrZAkYQC1BywJkArmPOMLfiMNDBimbIIS3MdatI41T9L2ZBTZQpkVqyiz7Msf56pZkalloalfdJOTxhdO2KNdhqpMzv/Wru9/Nb1tPBzLi1LeYVBsGnpDYlWrPrQJ1wgLzg+0lIngthiADFp9l8AAAIwAasi4OIqB4SV9uxLRTKAuSgQ1cIOkMKIzfaI7bmGBweURNIvUIwQGTDdz//2oqAA9AAAAu6UFQGFAxpU4KqJwGlnnDImZDmHGgkcZV2AFQKAChNHNw0+FngoKWQWqzqmIBCZIlDTPZ29rosuUAMIWBRRsLelp1nQ3D7CHLljOIWu9y7rjTb/PbAjkMEkcknM2tw/T08GvE7kxrc3awll6Zt1M682IBq0LsLhdM80Tad6ddz+/WGeJ6WW5unMvZVuf16vMTwfVqdCAARDBIdBPVLpAFEmAgBJAC1h2zBlH6HdoDAXmqAi91CfYyYapggJl2tUhWj/////uSZGSCBRpX0NNDN7ItwXq9COk2lbFfR01hD8isButoAJQy///+TLsFiJoAgAAm7PL9Cww1EIMUL2M0fO9sCghKFDocEoXnckEFAUokz6JyAwBRlfBLAjsksQdVWlyTAo9INo1IB5lkQccRiVahs9gWdxIWH3KKDoYSoTOXpjVxkkJch91+ulEWYwe8FlTfTN4ITojEocmB7VHEaWUQ/OVZsFA6SCZ4j6tN4HHg3IlDISRRReTz4tHKU6iRPCRUc3zQ+5Ihl+5mKlJ3e646tIaEG8WLZd/EEcAAiEABIMSHmvmsQBK0qOUFrFn0D1yiGfYw+NNDBU8tM+c//7f/d//1sVFqwIAAAAAuZ7HqSkNMUmocFi5s4qeYcgDOk+fhghUIsbsw0oiFo3fSGXZKR0sUGeaqttYehjBcUhCe9ygg6H3sKgEVeDjP1UW9sBoma8VitTrtMztjyZs24ICMTVqP3SLjPvbFPAdtcQOHhBXonbTVmsY5aKK9ZHSHQXvGVevpb5Tq8SFn/T/lZUe0bvNdNABAAAADY9J1WrV6C9D6H//7kmROhiRtOFPTLy4iL2NKqgjDkBGtR0rtsFpIwI0pTNOYaAyCz3TDl2TBDpLlDg2af6S3rIten/p+8Z////uLTrgcCCdswBBJ2jCI0wUDTMHB8zFCQ6wCCBcwEgj0CA0GbrPVI2TA8iIAVG4aXJaIhUZASgAXiEEzhstWQXqLJRByLNudXtDqT8dlshWwFwLb60L9SqZa1saQ4NW6ruTG1lsIWLty9exu1JGuGMZ9gRaKsro6WM6ZmO2SrbGppVl3b3SS5ZrEV7UKKB3XoBRjRdApFYfyZBzWhdtH0QZkxhXw8iaEZFpN0RPgG0P0vM55OUe4bkWrU8s4m8jb/7GZagAACnBUAMAITGwI4R4BaGAABFA/BfEYNEQabmbh6LENjI4kpLYy6qRjwEKJUkPAWVjAwBLLUpikaqwkVWQRDRiMryTia7Aa3MCABvuPtD7tQ5UadRSnCE4maxhd4dr2mJtBZRzHviDSMOX14a1ZsTmt3yNxtfT6hxy5xoGIMWtTrNrrKBQOsY2MCBQAOgAAAEBKgRmRIeTFivhwXefancP/+5JkUA9EWDbQm3ky8DNiyk0JhggPsLtCDeWHwMmNKIz2CLrR5hCccmvSMNtz+zmzwDijJIIgB/L0GVa4m3ZL/R1VTMTIv2YvVCMeMDDB0oNfECI5sAVTEA8dhxAkTN0GaxQg2D09RFMA73uSGLCraM+Vld6Kwa8CtkvoQlAYqJDgG0AeiqrNXDA5MTtEvYtu0qxAgIZm+7X6Xh6lOl/GK6/sdafb9cQRcZQgQhOSYqKHCIqiWncqq+kjXailw5oAADgHV8EIUea+z8tMmLeOvPf3NlKgzXyX0GX4DjjBXH+BMiu4AggrUbCNLLu1CP/+6moBAAABUkcNsNKpckGk6lF8KEgUiIALNX1MmEUScgiBP5LXAcZ9oU7ynQZOaFSp8w42ScgNwmZiMSzh3ogoJQRBmEqoow/kTUDhyrQy2zhnsQz1tGqjJxGVIEm5IFoqI24s+qacGLVt1dSaJSjM09F0/3e5COjvz23XwTXdp7/AL/QLrunAAgAAAAALuF1YXJE0H8tTycGbdfSop6F+rdaFbV9mpIhN0eqSvsE+mb8z//uSZFeKhCJJUTtJFpIzozpNJMM+FsljQm3kz8iZCWwkISS+/sej85f8n//SC5pcUU4JDzIGwxoEDD0hRSc3LhKDBAIBnNB4eAEwWawIzccAMoAGGDJ4CNDH2bmiC3J9xUoXgny24BPOC4cCMIAU+CVHcexeDRU5HhcdjLdmFJQF4nYsthmK8beCUQ+7kThb6QYsOjw77KIOf1t6aksz0SryuX3bYEEr5BNeuCIBHZkdBCRBz08xtpq7IdlWe5iLtdesIIOe0FDT81ZfkxU7k0xhimqn3YWmtz9xHQNxAOZhEZhYMAKBwTf2kDl9OmSiQ0JTiMkeBzQ+u/8WST3NgmyxPMFEv0qWUXUAAgAAAnLpSViQcBng9Ccfg4vEzGjIymemmu1ByXCoI47a1m/iACRQsbqn+3FXkBIVtHZBOrMpGuJaMdmranU+6XzlJQrwb2NSq9vXgPfR7WDHkipLQCw7vL34by4gVFhxlHj3+HGn1iPPZpnoGWTUKWNp6r4lib/4g12+WWt80o3f6YDAAAABTrvFF8RUQORCfQWJtdg1iP/7kmRMCEQYPFTTJh6SMQJ6qgjCIo9NXVTtIFjQx4mqtLeIyq54plBR6kgkLlX+B/u7/krOdWXqN//njsjT/+jAABSbuZZtmIVsiSGACUIYZKVhnwR7AIhLNxRQGrfL513l0wJk1Bn9WBWqtRiK6IBa/KIRIpG2JXtymmrWV/sMCAjo18WLNd3XUqUMtim1qHqV4D5Ghx0o1Ej5iYoqskz2nVzbfPQGzu2plyO96wcv067atRUvgMCnIogBQAAU2JximtDpGY8vK9d77D1DipSua9B3PJ02SXfSXulpZhZzK93i1hhobd////9yVQAAC6GymPCzaEWIDnuGguAn4r6Z7DwsMm3gSOLlBQgJAddJM0WM7K0gckzilQNchzQ1f4qlLCS9S8nVtr3a+oI1u8yqUNEZthehpLGOUlBSVbeN3PdDZoKLGg1erA3vARHM0ZO69Ur09svkf779L0P7riMsy6luyfZnljrrgPsWkt/pcBAAAAKmAqAWq6QPbKGTl82f3RspYR3Bx+jiYyqZiqOlubX0wOIrdq5lcSoknJb96bL/+5JkWo4EGj1Rm3gbcjPi+loFhggQwRNAbeRNwM0KaXSkGGjvDpLgtmKpJIAHKvAKLkCxGvnzHwCk0+zEDMxNDge6RIZCffgF6kSIjUAhJRorl8gYGTBMTCDh2FdDiPgISVvM7QkqGymWQIyJvrkpFR0aXJhirWwr1IVzC/OU9F9FYmLKIJM4WglylKKQGkQhYfdzqlz9HdS2/7K6nYO8X7oJZ45CHHkRLQ0LUAACEkAFTACpQA4NlvI/Gp7BhKaoYkRwxMc8gY2mKbPiOFxwgEQGscjkhYiq/aGEr+5NCgAGxTERHIwyGzKENMkgMUAZggbGuiAJBJLBHsyuWHDYGcmYEachubNg6eKuyXyBRqzH7QAhDS21OCrGREvCnMBDSIZF17VF4VEpe/E9L3tIQUvd12dapYCsma5BHsX2SyekeHZyYqOHdDD+pOqxFrl4hrON/1bzzP2eoNUffIIC5UI9i3CBRopj3vYJEIEAAClBB8gq5HMHW8/yjH8Pyrco5LZFhhHCXtqZLtVW9OhrbEjEEqXFlzn/t////8g0WHwZ//uSZGEORGw2TxOZWvAyRHpHLMUukLkBPk28doDNDCfE9hjxADDksOIjLvYWiiQFMXGDqW4zIMWRDxiJSuhZBUGBEGuo9z4gIMsylhjzqdqXtu0+TQIFg1eLDV3tMTZTJfKY42JaE4VDw4oSKNJcnkzrbxdKDC40ztc/s/ngAsIEIKThKzBsyGwhjgxTyv1Ssz/t+Q5My6ZsTPBKPF6UoPwdWQdc566AQ9cgKDS8TYig/9fX7wDO71gpWOvD8hIR0dVka0ZCDFZBeTpyVlOi4K2tXu2tV7+z7O5qAAALvgAx0eZ0ZXIGkCBhAEFgUAJosYt2hJkSZQ2VNlLmhuI8BItgD8mEotMCxHTLXBx3mS9ViNxGVt6FJRdlrZGERJrjJ3mm6Z+Ifhzq54el1eRRrB+6OipNRipMZRjEQwfAnRY9mV5HfWOod+9zPPXxxX1p/6VxHNjXdJVKmJl95e0m32G3vR7vTv+iIid8aYu4NyjDyKpDKo8SBAJAABLlFIdBFhBkySCPgjkH2TkLHaTSx5/2JtPubd8LOolHeX2l0cLSP//7kmRjgATXW1CbeENyMMFavQXjAJR9bVNMvZEYuRSqnAOUCP//tcD4AhAAAFNy+XdgUHBEZi8FQCgqfLtt2aaHQS+G2cu9H4cWWmPGDhZzNJoGYOpTqyGUYxziRI7z4JO8UL6FVppAH3l4jGq2lzlMpfWL0a5YnQx3zKB4saveYV6r89dbvX5n+v3nJ1n27O2n9uvptufmDVjcTaxjn/6/w/RybdHB/v839IiWuiYSLMi6BTd9i5bY75M/ihKig/cQh1CMaXhIxY+44IIAAAJABHwxj2SPKtdjvGnyAlU5zB81yMqMqKg3d6L2qh0b/VU0GCgono6nZdBOAAIAAAyS7qvmrCNkXNUPbmW8XpGWbGG8NSv3F0yGmWIIeAiKatHgcXfmk7FWNikkGpUrWf60yNS9YkUtx2WxznfNAbAzLB/j6aC13nXTD9ZFTl9k4hGNsRGTihbzOMNS6YS+XEy/1rKwotLM3N+UuSa8uJ++/aqpv81stXasfHz9BEp8tE402s/bX1kpjuprNZqbICAsAAiXYDzpaWRyBzLfGJq3MX//+5JkU4gElltVUyw2Ei8kGx0ERpYQrP9ObLB4iM2ubTQgifrWl/qv2na0JC6ZmE8FyDj70sejTTULf////9gAACbsMomoKED4QKtAZGNutjj7QedsIkK0KBE1bEjpigQECr4RBBQUYkawRPiCkXmU6WLLHZeh/y7yPsilU9LGRWcXhCBYSjNYvVV2BpaWqmJSyfq6jWpT3abl5zb4GPvg1Xh9vg3yyVVSqt5bkozoZcEmRQUayar9/vrn6hBVv847KDv6WiqXEACk4APDvpQm7KCAwAuZVmuf3/YDsP/FkIjBlNXLII7erf////////////9ZfrLQVQAAEnGxmRekBIR40OgVOBcmZbyBn4yDRBE5CFz1JjlBaWRpiBMqUqlLdSYc4jjBcadIqizSPSg8vqy4C/nEiSHdvZiORmLu8QAuFGCoZRqK4hyQ9AhoEkjbMFV1JwtVlBqVx7LYRUgEsu4xhpk4KlP5lO/wz0kI1UZ639tFd/z4sUL+K9/aQAEVIOas/T5CuKBi7Q086cLlPE0/EoMC0Gg9Pw4Wf1xcylRM//uSZFUOBDIyUZtJHiIvAcqDGGw4kc1fQG08dMDFk2s0Z5WK6SHmxv+zr/01/3OBkjXTOfzLhjcVTsiQaXDmBvuwHRLBqGHtMNOeFFUooR+kaeul1WRs+B2yQLDDEEtioc5z/pEhycfCrQ5VCeplQlsG8ozFM4kLYg2UuzkxM6ie6gszx9LisrDUBdoDZxLAIJogIWNEI1hghe2+i2kLaaX8rnvhhxq2uQjjCHshFCzFF95MudBU0++aNm0FGgAQYwAS4xgPSZa30F3eVuOLatFNk8JMMK4RFu35f/v6Ol1ibruV3RDKo8JAwW///+gAAcYOYLbmpgBsB4EVRgCOTFZnPAIgBCcVQ4BaqMT7NGImeKyx+ExEVKpUIBgfopoVN1MEVn6RzTQa0jAlIRAzVWlRh35Ng7ssfaAmfxJkEUlDv/O4sBogWBwPGTRtXdRzHaIkkE2stnoVDZ4cVjm7Kp1e7HhpTbNIVpFEV8cAMcONm77w+1SwAiUFNQABAABIAQSVBkpIzjQ7K68XXfwVKy9muqoHYYRTP1UdARAkh7gbFf/7kGRZjgRhPE8TaR6gPUTqSjFjdJM9LUBNmHxIxgfqHMClSndsj/3aOXSFKzELO70h5Ff//////lFg9LTKh00cPCsUPJwwNBcHEZ2PFAiBBUcASOPBcVXMPCjK2roICAOQCLES0Ig5wFLAoamUAjAX4VjKB5rJg4OvFBeQLzstaYQsAhwaA1GuWgVIv+yv+C5vKvTzT6M4WEcV+K9enz4QBV4pyoMPWHOCWDojVrOWZlpMz7sd2SbvzczjIHLMIr/n+Ry5fmImgSk8EEgBQX8l+85/CGgAkgUTawWIKb1n7R8/Ob1JJFGbD4n3pgc0AAwSS981qLqLuKJYyNPrV//////8PklAjAAAAE9mRLyN2HBgsxJFBcLiHGVuiJcox2IoOgIMX4HRIenldGWWjukgCXRvRuEPDw5uwsym2UhQaKKQYmsUQDrdZo6EvlqE5cDfxhW4OMYtaTobNS09aITdyGpxxKeXTeMQvLpCRz6pocs4pOE3whCdSqd7m+H6CLX9llHSjKzjdMyymyjKZM7FYRlmo9uKJdkXRGLisQBdMP/7kmRNggWJV9HTWUtwLKU7DRQi0lGw90hNZQvIwZHrKFMWSnosGjYLk5BqBSJ1gPFEaZO/7FZQ63fTREtSAGrwAFwoERkqjO3YaHh4oYuQfr2W3z2AZaFP1kKS1KN9qROK1s2d7GgbdIENgE7NBWXsSgErTD1BYBAT5GhNHEOxLbrxGgoWsCV7NQYGn3L2iggs73FK7DmCSTVrZiGg0hWV6x0IaBonnVQkEHPHD63JFZawzfCV2xUBMkkAoqClgZHCeTlYbA+VOJmmQsqJeRKQ/DzbbK6jLa2JnflXKmteGOlU2wNd1hKKpJa0Nb/Hv6EuvHUQAYAABLACRgkO0agUVrccjNoBGbGFbVoZRzujtCWjvp/QULUlB8aBVMFg64BYmf9SAQqQAItuXRUCzCsDHHTdBVdWmUS8RwmEDDS+GYTrsQyZATltRX261Ld2uLOrQgjzgVorMsms00LPsZPfEVVadskMVGpMvxs1X/3bjXvys7J/QS9ufWJZCRLkpS2MU4eiKV1sbWZhPRkSafdrNe5sSFwbfwLJ1O079w2QDCD/+5JkPoAD1EjV0ykVZjGDimgFiQgQ6PdATRh6QMQQKQjVleABi4jsbbRv80R0Luj30drJGIwLBjGqT8qcuyoauIiqFzZ21t/RxBWoQxt1Gv6v6QAC+IGN5GuBmbSBqgcCrVMUvCFDSnqPMkEvTNGdmbAuZKYaMiiU1gtdpqADpPrFCgTTwtlq2mzvMVRZZNRmjdpb8WyaOrC8ky2KGX8i8TemrZYzYzBoEF6e4qDyQi2S5EDGxCqIq4ozXwKI+RdL7D3bzL6VhfTFCofSXkUpLTdYkU9oBdRcu8AbAj+ahjIMlyUewVE3yrg9DyocKPTEvSJi5C0vYe5UWlREHmmxFvwoXsqWdirev/pqAMgAAAJSihHGBLExSyK1my1hUEu6/aiho6JoRlagtJT1sxALYdtRQxg4lHDvGY8bkUC/dJYwS1X53i1fBRrPRQ7DycdQWL5q5bN6BoVJnwfVUobTorGVMEMTeW+Zt6BGTVbt8+0dYjGhIWCY+6kJxXSu8AzAAAClaKEgoLhDjlJXzV8IRpGucvgz+LqWVQB0J/DNATLH//uSREsCA5Q9UNMvHLBx5/oqYeOWDdS3Qmy8bYm6n6jphg7J/dAHRlUkYhKMEI9hfqlLLkil+dwWq4M+XpIdlmXNYXzFyjueMIhKIAnMK1WlB5LijUkIERGWWfmfoEP17/z64/YLISioMh8mYwK1Xe1NCc4cEoKK0DJbCCWkIumHihHhdER5MLE3KHHO0noDYudoiw/l0cjCnVQ2wwml2+WD+V8dX2lmF3u8ah2F7y8dPnHUgE8FtECFnCOeWFMso1I2DpDUSj3vJwnY4zxNsv/OEt/aP/Wv6GS+msLti2rHAEIAAEqXx9UsihhhOHJfRWUK5SDr6FCrdmXaT3novBjKMYJZ9NRyMVGSxSlrMWmaaWO9X1XHfhrQaMCc3einHdgnDaFcj82cxMBt8nczdJ0YvP+LoeblPwhw9vt3jC3aqt/HO3HIP2d1rYvTz//dAAbI8ZZ2b4QZQ2msIyxUxmSgAasXDBgQyDEFDaUoypypNwnWAoEgEzREg+5FnrrR/VgYApQ3FMsuWEPU2X0geseMxl/GnoKxeHY4MCU2jV+Vw//7kmQpDgRqOM8TWEryL2QamgllGpTlRT5N5Q3IvRBrNDCNGI/FekcFFHgMWYKmRHB1pC80DezPypnF89PLbO7j4Ryc8hLJb/BP/9v+EJeWzDFVfPzle3/ZUzYmhjjPckHAAJScoTABPbaXfJ9vlo+J31H6mk+Zq8a1AgPKyIn16Cp1AMYm/cj9H/6//2yAP7MRVRAJGkXBMUmCgZhgoc89BwIIAcKgRlJAgpfYoHCts1kBUJ1rFQfKhYZs0kyxTGYBQ4WNN+8t+le1sREaXQFmxqsYATPYxDylUOQJRu4gkSQZ3uB9Sp+n4tO3Ln+lvI/Vaw+miiCAaFFiyAMFKOhxQlxcXcgUoioqnKpCx9mRMyfLUtDZhMXLfSRDczr60m4oZYu8ILkkCiTO6DGMvQdlx4x8N++ACAyCAlfwB2AjuEazPOjah9cjdl0Kem9edCIlPRSynhNsZDJ0hIBjC94IG9v9CAAIAAABJekoMARYaM1ZAE4Fy2vm71ZMLucAQU2sNAADW3iUvhbklqgNoYAag5lhlGUQWiFMBeotmX5Ei2X/+5JkHooFa1hR03lK8i9kixoEQ2yRcQVMzWTLyMaUrLwgidh5Gc2X/BpJpAhY5iDThgIiHdF78XjhEPLJf7CIyGJRqACg0jG1puIjqqRJQCWqjNIyg2aLtFw4KSdTTZQR9uCeQ9wpZz21X1OSNZdeGPey1kZw689n8nV1e39T88rGINz7Ml4L+TobBPbhW+/Xn7fs4AjAABNiCcltZJkMtG/CPLzrONs7vtdvaX2EMIPT1QZSLDBkwGNzf/6Np843//+qANPQBACdZjdI04VglByMw8jdMLGxqCptJkEZvCUl0dPQkqVRgOFViurkKzCONqa7V/wO9SIwJIWWFDDCBgy9E3SW1C7dIw2GozR2q85ELSQouTYOKI5jEkzAQkQQdtSbuT3WRoovu971Z/haPY3G1K5pc+sp8S3Z9FHWjCmK8trFsGSm88VDJO//v3QEFACAAAcv/AKGq2VtdBO3mpFn6xf+HnvZWMj1EqJEVRZUpfpjTBHUt311DFPPWFhKAAgAAAAN2LkW4cMdi49gAEBTgOJBxjwGG6KTNZZ2yYLG//uSZBCKBEY+0tMmHpI0Q/rqGCcskGz1SG2wWIDPCWroEyQyy9wAuEgcwFIxH8eAhx+wIsG3OuBnmnv+1waUacz0wwIAxlkNQLQy21AS8m5RmJTUks+/KMFVOQ5KbD1AqMJgWv6Zkzhp7CiMK9thU6Fl7wv/9/YWGNgEYmKaW9u5RLc3+0fa9nX/3C4zAAACKcobOaHB4mcnKiRSEohAQUxaKYpQktqXoj/tsjmFRKhTf27vY1+zVnS7v/R9GSUSBUbSTGl4lIjMWYwALFgYwoAG48aJFzjA+YQUrVe4UBS5k0toIEWIvwwJIoiAXxZiQjAcRPuHDjM2fOQWZSniqCN+X2jLIXniM3GSqFbguYKqjYKrnp6a4ht8+jZ5NtHOv8H619XIaV2HV1Kj03U3p13vSFEpm1iyb6kFlqqPJMAFzr0gCTAAAlHRbiBgHYrG44gdcO0QRQqVnsaCPQ51nyxZxdqRb+Vzgqkl9v0/PbXWM//+WZbHVQAAC5GxGMspiB4ZT3iXeFUUUMzfAUcE9gA1MiIEz3GUsCwfAmTXX8uzBP/7kmQVDwRlVdCbbx0yMmMKeiSroo+Y2UQNPNZA0owo0PYkkKCCw7QXAuQFAc8SyZeF0BaA5FcI2n0TFUhbhjI1xUCKCpMp6jnqKxKs7rD1Aa4byBNaQNQAMwcCuDUNxnHo/12IXSVP6bLUL1L1fL5ISW5HYiWu5f5dc0p58zNStAP/tMGzIAQAABJWAGkp0bFJKjAXejBmc7m+91bFjX40HKNTIJQtpdb9C86xriNTw0RKmaugoW/pKgMzPgwTA9g8x5oviheeA/YZSVAoIKqruIlUhKsPCoMnvBjdwsOU5gpUhZ5+LJWBWm2r/KaMwZ00thjzq1qW4K4Yz4JPNZYstuKbCrLPQ1DENyzYYowrfkzPSsWm/8NMRfz/+M1seNOaY1GCyRUfqSq9zRrVjiqxSgdaKFgAOCAByXt4toOozhKAoNxScipIJoDb5chtKANORlgZVkyS1NnK7UN6fSaZeLECepTVqQ/9CggAAlJyvAbUaNhJQKBkgiGo6aoEkBirU8EYbq3lm6+NEs994KeeGYCa4v+mdSniUgsPoIFsqRP/+5JkG4QEMVtUuyxFJjDi+p0l4zCUxXFITWES2LqSbOgTiwKLGX/aSFhLHXef9+LmYHDJWOB8F4uOT3tqtwdD88PXk4Yer9q7yg27ny7uKHWQkI99NSuTUPL7pSU99f803XP8tT2u7rvz4cEOOPpJy76EAAQAAAAEGACzPLMAo4VvBuZiTMQXHgQjrI8ClxANAN/p7uggufz8HgQD4DJyXr//kAABuXHhNDwQyLEORmQimXigKuJIzGpy1LPyYktAtAi/HXZc9CeuYCC1ipyBVKZdIEoHzBhh5iicDQ3wl4gSMpl6y2zLsmmP9StgLltMWfUyiFugxMJPRpFg6B8Fh4aCUUMADkiCaWqSeW4mFWMsRMFh1B8ayK1yoxza86yomnZSWmnIGCqTVZJF0uvXxMbnjCahKvxzLrCV6VE2kwYIt0WUSho8wsZgzIAKUdAspmU20ZUfg4yaL4BAF4WhQHjUkr8xurZ0wQ4YS4CGUdSv/kK/////rgAJAABSUtqB2YmCEusVADAxBriyUgUMFqy9NdtsqXTuq5g2JPzFUMmY//uSZBSIA9tW1tMGLcQ1IwqdFYkSD51bTG2wdkjTDmockZbCS+V41saGLrxg6JubjMS5zhhSW+vuLrleNqdmYjSRtNrxuOaG5W0TOe8O2W3/azbIVNpjJe4DgVT2KUeWxaV1qouQS67DmUhiGIQh0SiGEYTy0kAAgKAAAAsAJIKrQz0WNRti/ppMVqbHpTB0KBoIwfK10iLX7/nObchK4CHpmSKJuR9Hb/7pEAABPeAjTQdKMEEi/yy4MEDlDsMFGspSiIPuRZMUiB8bLesNdZpKYSebxIrigU4TGRIClcJaOp+N0iuB/fdLr7uQvhKR6PFll5uorBMzRoRDlByoYNCmaBCVHIUTflDP6RwKpN8+6fO7G1I4Zy/9//8jh8+0r//71dSwVKYhAABLAopWQPQTLDcvRbOnG+j2RVgXiiWCJdB8K5DBkoQ/WJAmJXXkDYvEUg+r3///////ylUAAAuhO05Q2AQGZLCg47MIAQaoHuvaUbLzBBOop66hhmG0NFYbDhgcE7TIIPHxl5hQMRvJmIqhCCtq/VUSYJXuAqItNf/7kmQiBEQvK9CbeXpiNaOKUz2GTA/Q+0TtsHaIyowoYPGxSLlgyl1mV0EmNtlSDPPTLtzhSTbtI9R+52aFbcKfOr13b4trNJJZoZikilu1+5wu0Lhr7WGUzf47/51KRM+4/V6/TAEFgUc3sm+yvGcX0/wu1lM5tI3msbXVMbDZkmzhTUbVYPfqz7LcOqqrvS+BUI/Sj//////+8IAAp2hWY1M3MFCTWgQOkmZAkNMlmkGXbAwSFgV5qpAGiMLqyRs0DRKVJaqbRNeohCF0vAud0YQyOsz51OjohX1YEyyp0IDw2dblY0lfrSJt5yx9L0SwyIqZ+DIDZSjBVIIR59HKn32vk6ZlnvHNsOlBIwlu2xeblua+cvzJ/AAgQwaMxkoIzsgaFdH6SQfDjPEB22kEoHB0flngz9Scmrrh09+2nHuo08AzQ03w/Sv/cgAAHaG6mdQQJEzMYwABDwr5OIaxIUa8AQExwQhEWTkAog6On3RRfh6y96Fjqr4T8VoZgzxlL+ylIVnbvyAcClEIsAFsLEKM6JFyEmViKiN7TEySEp3/+5JkKo4D5D1Qm2kdoDQjSfE9hlgQaWFEbLB2wNIL6hxgjUKww5h8euqy7Ibfdv187PysXPMqRSd/ODDgMoAssTIBsDlmRVpw7H7AQuKUqAlyNeFsAeU0vImVVq2vUKyeBDuEChsD6KUO84e7cBucqk03pki7LpoFy4SD4cKfQVNmFCPUVTMfc1i1YgZGBmWWOo2g8FI55BEZAdLMRtXzJF3rHSQbSYdZsz/p1rsfiMl51JKFQ0MxwK5eiLRmmHM2TpRzOGo0iZVZbc7XrLCIo69oUbFM6t/+exkUzLcgMcdK5fTInP4Zu/17xEIz4uE7+5cn87OcLvYeeibn/MMLMgMWEwAFSWjhOEzT2AfPenTlWd+EbgQswRdF3sRFNPDjrT5ccBHPBz5jICr/9vk//ILT5SOrfVUAAJ3eATH+GCySUJPCAQqGBu24sGY+SGoLQlc5WDK5YWBUUk0hACCiyz6w6EQhLhxZccdiOy+SSd0k61V2Zw5VceGZdddM3TA7vekayu/dIYHtQVEs/ODBZxPbX22jFE923YyGbOQyYVPC//uSZDUCBTtc0hssRjItgyrqGCNMkrlxU0w9K8i/D6sMMwogp5XusfTiOYHAcGQKRXLEEnu+iFicmEdaGCJwQKLmJC2mlZETCXq/N28EfFJ2Rl4h7grE/AoKEB4YDQGgPIAYoABKctHvm7LlCj4xSGceY3sVeqc65/RLUOEUAXS0Qnylv6P3e/1f+hf+lFQBCAJzeSApqOKQ43Z+mMBPyhC52mlggk62oADB6/az+LgYIJI4hNHJWlwFhQlrYGIfAtJmOKXRSvW2ZthVMt7CfPP8P9P8J8fEmh9G39ix3pZ42pK7Qo2JLFybGFCNZLzu8MJpFjDM24ttP2UJyTdC9ilDzq/CMrz1e3X+3n/u57/eZKk/Ke1kOpCjchgSKoyZvIvMxHAEDf8ZG5lWG9HOCJ0swmpc9R77lfZRQnoZ4k+cYnO0QzZoOs2v+ngHu71Pf//p/SoIAAACl1ABkhZkw5yNZzYGMuNCt9JSDlRoLaqAOBgSrTvs1N4UPIPgasnYAhICi91KSngefAqRA7Eo/oljlNF2mMOSrQp+qyX056c+5P/7kmQmgmQAWNS7LB0wM+P6lyXokI8xX07smHhAzo/pAPYhKJJaSobGrtkTMZq20d1v+DCqTfR4Znn3ZwEQtsViKn/Xvnqn/In/nI2Wca7o6OpAAotCaCAAAB4Acu8Ph0KdVn9H9Ur/sSecPtSXykxbMoLFDx5osEJKn1Uiu0SjFH/3GTBFly/yfywEE7dkZSJRoPKn6EFDmvG4CTZv88Jr0MksIhJz0dNGWzPpMsaWvaiabw1rBlVsdirHnLkNqcel7L2DsfTCjS1BQKzaCq/q7E9q6Pjo3n5cMOlGwQKBtjakhHUexvcsyNjnb8OqUJZL9881ql/1T+/I5FPnPc8jBtEtXbVothFp5ULd2fxhHyYZWW8vPXzoX0eB8dTq/mig8r6DgZqBG0KLH7r5Rn2qXA8iJIS7KAAMgAAJTlg0yJcFACC4RM1OlIlWQw50ZaBErUEeC4Km1PRJ7FtaVrc2TAqG7HB4C+1FSvVoXXVakTSbDrzkPPUOfjpBOkjD0ztqpA9IV3a1SUH5KJtyz/m/ISemdQ5oRlVkkbPH8v1P0k//+5JkNQrDylfUU0wdJjIi+jE8aaCOaPVKbSR0iNASKMz0jWF/3wc4bBQTxZ9VNTRkcHEBDnqeQOJdEbUK9qDsg03a1iqbrHYVZBQq2ipgQsaIIESWns5INbLpBZxkuqIi5hKtnQXd3ZNA1BgAxfokEJhl+UoyI6pBiwXXLfmo61GUX5es+LQEsCopXgJ0ERXLhEAC6pF8CpGQpqLkKb1grAJLsKJSTEcbx1dqj08jz+lQKyDC6mVNM8tyWJSzIzIiehQ2rgsuwj9a/nJm7XG/s/8kol3+/vBwACoAHXB5nkcJ8zltdpCGOVrzRxPTZYHUwjkzrNMdiEeJcGfUeaGFt95P4lzPOgshV+PezQAJAABJTkuGTePToAhshDmj2XnVy58Ao7p5ui5Dz0U5OwW1+GntV7EX+AIQnSNTMNBlGuF1oI5CCCor1p+3U/dCKSsSKo4kmDuwGaKrDMwf8n6bq5m5llCiH+eEiA/hUo2ZOAEAIpQoZnEsmhmekdERios6Z/04R7jTgAOEQE6AHSA+Do/B5Zq+lL2o8Q8wkrwKhAsm//uSZEqIg9FXVFMpHLY1BGqqJQV0kplTRk0weoi+DKpMkKSKY9Sofsr53W9GnQtEpSYZAM2Pzxv///////UAAXxM0gEnZGKeBsVY4tMMLHHkYXOhAAhMFZqBJYns/87eLiFwV3pmmREtzdRBhDRbiL6g8+2Au9FHqeFOaUSuB5xXVZtmRp9tCprEH4fHnDfpXDg8AHVpS++UyWJYMfQNvfEJCJhxedX0qzc4dKjDfsRWtEKRIhBYXHBhDPsczbNX5Vzz/slLRt5+cghypPTymDjpuAACDAUImiREkbXF/lHs2DDoFzcMkSWXz2o3Y3ikMgQVaYnapKjJkCROr+J///tECgAAtjST4u0JBg+ykNlA8Kib9PdhJuwA6RuK6TUHgaNMZEiS3sHqVmSBAdxYRXLsv8o7BjwPQigpkSiAnwo1Q0qkIDpGqchsFZYFtULbEWxyX6sOmxDkyTZ64pw0dARc4qHixxIuvaA3Io0jgoTMkJw06mieN1aTWbt5td4ZEjHQVXb/doayenVQaAoOmASAAAADDEyiAelBxjPA2KO0/f/7kmRPjkRoOFITL02gM8L6qizJdpHZZUhtpHjAuovqvMOg8JpnhHbovL52ugCTLM/kbvY6E2HQW49u/9Bz//0W/////FyrtARIuDRmYTGhzIqg4piL4GDCuG0MUb0QWorRMvAIH2shjbNoCRnIiCV0TeEQTp3Ww2ev8ntOw25UEw5GKjEp9+hF1smCS5E1N6JDHI8g+HbtQBbjZDePSl0lsSLPjkPkV4saKZCusw7e0ZiDqqJMLnsoMSg9Bpg8VsKelRhzQvy8iXpJ0/3ChxbDihKYMABZCBAIYCXnB6cw8AgCWE9DSmpOyCTYqy5pwsEh7qTTYp5BLweDiPfu/V//9E5VAAGU0jHHAiYjUMkx8lbZB01frGmBHhJIdtBILiS2wd0L8jUTAzkj/CVekzQxxXLWyYoYcxNMWXu2/aibJX9eeAW0jctCwPHXMeoOBoxfrwJNZ0uzOIvn3qW3WTyM7bQg6fWQGVl8uVbaUu0JRafh6Hf22y16xjdi4a+CFcN2x38HFpmbLhv17f42p/u8bhqKOF+TZ/SfQATDMVZP8aj/+5JkTw6EslFPk2wepjGkakI9Z1wR0Nc6TeUvQMWRqajGiOr+Ip9+hS3J4dMTJp0PBbOL209q97tG0qdjfXB0Wp5jzerXRKkpb4p//94XvobHmGOFRp2EcWMLVIhM2Z3NJDxAIlnQbNpsPuSBBrZi9C9SEE4FnrZyW2DxYMXoFBA5VoUAiIJPJmMwFCIwrI6aYkheV+B0CL0LRmEuK8083X5PTS84yIypnnGDCA+JDaHsSXe9Wnk5eOO6JdqsRy57yyHv5+xvWZa4JxrmOGvQTQgWlid9FIeQDLTFRAAAtCgYX4hpPdu09IYKqCqJpekq6iJuFoYo7oVkclmZahS7b21T+MKmiKh06x3//60AAeWgaUHG8BxpuQLRBWCmEDxjj4NIwyCjwsYsxIpOqreYMhXXUVsOE1mrTe4HBQ5DCDEpsSgalaWzpL33JFCYDbPSwCxaMwqPQbGSIM3AzPolQQDEoEPJuxUEiGmUUyyZBPFdncYppJpWzGckDvbaOUK+7K9+xZ4ce5gQCZ8gq8hjbrCR/EQCoHjVSbgQAIAAAAqg//uSZEoABHA1TpN4S9Atoro6MUZSkSldUOwk05i9i+ocIJmADE6kUx9UGgNGsBF5CGnC8wRdFIPdNtVrFSd4xIiCqCbwF6x9360/Q1AEhJySqJLMAV5k6GchcYc6uzVmTNFrurLWG3rjl1pXL3sh6GYfM6dAQUFMbMEYpE66FV+QKgsKWyRgyhQtVkK8139dHGYXAEA4rTM7JUmAgrsT0FR//GUk0BiDMPzKy+HHxjJ6ZTVH8MYQRBjVcliO5mf9mlNz65Oo3/5eROFNEWrDnntCvIscAwABTeiHFpBHcTBCx9rpPTEKuoTYIQ7pvADTv2596YiDYYeoMfe7/+/R/U27//pVAAB5KZYriw2aRfHKEAOSDEA03C0Hp0AgAyNGZhBhgclGYEMGUEEipzECQxEBDhoLhJcUxxwQMF00L0on0Bk6ljGVFTfIHEUmxIIiqjkfdy3RyNlY4g9St8Yk7Lm1W2QBOMt5rc+0tYqmasUMiRCZUFxVgDBHXcp95+3FmaUkCIDHUvO25Esq1p3KdjbIL3HTkU5SVCEESbScpMxC3//7kmROhgYCWE+TeTRyLEN7CgxJTpQRYUrtpNxIv4wsaCCs6gB3KDa1w9Pvb7fz/7l1LYetD+//b3n6aJduradDs0AQYeu5AyGABRAFA4aNMLUpsqVfV7iB3O2E1MpwbkxikxS3bOGjb4pOf///94s33GqQgXL5g5CoiYyJA60X0QgptseyWsXbM3K2Qs7IAhATIZGXuQYQ9bRYBB5k0eMEDwEVrqUDkEWaWk6xxp0Soo849JL4/TRtOtQypMyaWW5JHWQzscp4xFEzsH8R+ytsnH2Uxe4JkmBdUAhoiiKtxIrCl3q0gF4pTRwvr8f6BJM0peG3+Mqdtp+v39Q9v9rKL8ZL7k4ns6REpQi5P/IbRjty5gEBCBIbltpDNgTxZPJalQCaip3+aqpuV31KJQkJpJlVNd/Z3frXpusQ1adH7v7/1gABtwQQJEQeYrbiXCFBcYHTfk4OI27BQjMgFFMoMHRQDYRWGQUCYwqkElBokrKlrClhRMZ/yIFtZ9eKfCcy6mtOY4FJEHakz/NqsIy9rkboJfP2K8FbjN+EO09u1lL/+5JkLw5Uli/SE3lLcjHDKtckZjqRmNFGTWGLiMoQKYD2DTge0V1mCrQbMsF4Kn0JcUswgrmnCLpFkNbJpM2TnPdR9a3/XHKffw9/NO/hq37I70tNa3+2mCAAQZdh5RIz18cfoWYK+5vmVgFXNn9GfGzpHZ8QBgiWhg877LP57Lcsv9me4i3//dlQebkFEptTR6vZpzYAXhUYGwBJ6lgFR5pyTTH9LAkCLfvWGGGjtgpRQREmlQTomESnSCHvxEX/R9YVGmYvbD1M1qLMqhSmRRBdYdFYzPj1KOTZlNU9ZC4OFq0hoFzl3axQeqg6p0tt94IWdpN49y1a5k1x5XsT/fy9UyauKKcd/zTNzGfwQxWwTyY6elU6cUIsri2J4V8/G8zSLfjMlNPjSnSRWymHgmukrrMKWYy9aBUKkeW8NUI8ddSPIi6KnbYAAfvmOzRsKoaGzBdWLA2YyJD9GZBYIwRvDIWkpit3FQIMFXn8TVkajCgqTxEPo0BKyEinBTwhx1FZ0AsDtOshUvJyURAkcHEJiwtbID7qVpc1tXEMcU5U//uSZCwOFDku0JN6YfIzpJqNPSc+T7TZRm28y8jDDSjA8yWRElQxJtNJs/Ezztpa7ELPj/e61XtDdv0tkz9GPONX/9zfz935pjGm8JsdJf7VPusYgAGAACOAAOqk6MEh5QP1ImvhHDDocRlmEF7BqS6B00N7Wzlu4mruPkft+j/ANMFhxQ2cqS1jGgsx8kIKMKEYgEjITcyI9BQWYWAEguYAGC+FIZxI3bOwi0oNHLYgVqhiIVBcUMlsc5LoKGKeSVrVKObbm+TNCYTtXqyZuZaQvTwMOYi2cbK3xtzGd63Cs5bXy+6fjO7f5j+uZk/Ezz4Ec40pLq1NM79kl//b7PwPvIBcyHRUl+KhYHKQFtHiQhbd1QIC7NUEi4i0AZogTy0ivLvuaOBSoWDuXa2GlNfTf01uVQAGkIBSklmzFSYQHQB4yqiS4IAUrkrOow9rizjcp6MsmhuKR40IHERYUIGFEdLWgGqp/sh8Dk39OHn6d/c25Qcn8NeE4p1nvVoSoJia0IW4r/MXV+EyAYErWECSEXi6nDCXT5Onw8jSEIzJ4f/7kmQ2CIOoV9XTKRxkMmJajRWGDBKxX0ZtsHqAxw0pzPMlIv+8J29ac7Q4cwAADAAACBwLAPgUO7mqinMnzNEIqDqxI57ZX7Ixn95EgA4aYZWFmOp3vu//+f/////9QAABajRDaCcyQSAHEZMQGBhAUEzFkAOIEABgA4YSBoUx5hazH9pGkp5qbPEgkHg1/YfdnTxFp49YEQQzSVyhMmUztqxF4aiUcbmpg4FLYZND8vm3IIqxiEZkwtl1aYPozTz22skfFI8UWvdWfZnpV0hQou7JzEOSCJ9f0KISb6jOameUl3OE8K1af3v3/I/b65cvBAgSAAKQBlleBrPEW4HwkNjk0XpBcdUMAL/XZTCfnYb6aJ1WK50wwustjWsFCFlbE6fb/0oATAAAAXLrpuwBfkMLBFmD0KTCQ0iGGigRM1/mOqeKAM5fTw4Empi+LliUKgLxxsNz4MZPvNOkdPPmPNtjwLbDy2zIisNDIdbQVrcrYx1qtuel/fzF3u0fGucevMZjjyIXHCFCf//4L3YM6hBdyz37D6c0sQJPIvcqDmj/+5JkPYIEE1fT008b8DJjiq0diAwQEP1KbTxvyNoOKdxXsArGuuWf0eQKQAceQAAAVYAhfjMMIZEMmMoQTj8fLE+Si3sP+RNgs7oLTAHrGItzHQQvXbcIO+j+lP+kpySgHoVig74LAVB3/MKbMSBi4hKGZCSmICg4MB25cXAcKuUxxA92s2BmiphAuTYVZvB6POYgGWRVqRqXUqbkJ0rfKyKNxlPYUX1mNAqunkWGhEDqWJ649Zo1flI5HB6vB7nmgwct/L4k7/KXwmHY3zSOHkpktkz5umACkyE9NgNMAAAFABCT8SEcK5J4pS7QnXiOB235N99Wj9JEgYI9fhshcDr96ErUtvw+12ZT9lH+mR/tJ/5aAAKsvgI352IGrfAcYIQqj4izMUaKIBhgRariClAsNsKHEXAJwXMk1CjOktHYrySVUpxGCtLSUUy1dljQV0gA0FUBhNmlov3xsl/ITsiRrUbPtD67021kzmUS3vDdvis2h/mo1TurPJ8/j1nRdVcuUi9UpfR5TwRKCGDRczBNaAmxwRtMYL9vzcNumMpS//uQZEaM478z0xtPMuI1I4oxPYZcD4T1RG4YWIDLCuiNh6RynP7VJxZNYxAvZDRSpMBulweeTRrmFkL/nfhKHuGlr+0AAJyxLUy8JBUUmQZmZWDaXoXA5i8fmFAEwQRiQx2Mo1DY4FSEJzU3Aa8G4pHJbwdNWUUX8oU0VsP9E2+fWmYTFafUN4PTS0oYYLUjRh5DSVbeVlJTeT3mK1mvahjUOM1QVW419GI5n07+7KJWaPhu841dmpQf6Cwo48BFCADNYaXkI2Y9LFyWMQD+hxR7jrv4p43kIzFnQdn0KX+sxLZOpasPALRUitCyXfb+7/8vAgAAAXQnsZvRJikYmbrWanBoGBhiMLmQEiYjCqKxe4wwOVVXCUpMohZ25QuQiAq3WLy4iClEyoKAMiB8vWardFoIb9bcOO6EqpWWFgeC80ThskcOkrElZbQ/fO3FqWzb6tsQVFuDLXM7B0YBKYhszvllozMzLnlZ/ayGZZSb7N19CWacweOrtznAQVCAACAAEpiDKMuaJD2ppDRUSFF2xJJHyDwfnTTBm5aeGV3v//uSZFcKBGJMz7uMFaIyAlpKPYYqkRjfPG2wekjSCajo9gi4en0uvsS/nvR1cl/1f///+kFQKomlSxEhmcRR8YYXOUyMqaggmVKsoIWwwbZsnAPJsZuwoeCwcCCACTsR9eBRUuq12A18s8dphzstx0tCITM82KGG+a5B0LV9WfiXxt/nSlNMRT1XAQF4sL5ooOHknUT9iybRN9DGbnvZPDFTpIqeR318fdvnSYz/nri/v5vJI3WU5tanhP+8AgTAAFljjmU8BGDGfi0r60+tU3YL9JTgWOSum7fQ/uvgx7jRQ+YKh90hyHjO/T//d////pUAAFOVwiBbAQeaarFDEIxYGspwaK76bDHzEAgGAYcFF+0L6NpBf9IcvgpurdFY2XjaqqdWBFuZytmCADCcnUnnbgeJzLexN75Cslx36Yg/lSG3iY+v5WAgTQLAmNkS6I4BoYJVbkaG+jSqnW4z92jq6ksS/e71X/yhXCEfCszZAlhaBOGh7QAL904ckU7lTRFN0sixA5pPLYZdkAgCKIAAAFAEMcFRFFJMC96RNYBGdf/7kmRYDgTWUVCbbB6iLyLKjRWGAhOpX0RtMHxAqBzsKFAbU2BBlU+NKQkP80MA7IKogZK/DZNbRP///xPUCZHrMXOUrCGpySJc0xyEvicEWLE0OZo1gRkHg7L0hL7dpABgkBJ4luk6yYC6cViTQn0lzfyxRN3YCnc5XD1JxucTp2uPUDAi53bYk0GKOC6kQvQ/dUXYc1ou4sRRiHXXL4PhMHhq4w+NastcnsqbpBiyUNHWCpWifk8ozy6izNJOdlyfL4vWSU//z9HxizpKwhQisziTwmL6ZuFMxAQEgAgAYAT1UiiL4gIlAdeyUfzeY9WUjRF+mvrAYOxZMHC0wvEqcoThiyoAABuSbCCWWmK8TLQw5w50PHUtdJcrEeaWKFvZTRxlbUKCeaFTuxRttyPUrWO/1kENR3Pu4vuGh6BYvvHzIqjb8Gd7JZVrB4CJbniEytS5F+HF+9iOW5+dHU6S+UNDGm9dzzOZPOQIJPGzNjUB4EpfE3SZxvpeIv9PpAAADb1FKQiHR7tWogV51TRTKww36bcHF5NXofyep2muqmn/+5JkTgoDzD7UGywdsjHjKscEaAaOpJdQ7Lx0yNeOKiiWGeDlXfQPgEsoHUn3//zqf/IwCdtMAZhohUCebBXlMn4aAaw6BehHDkAiAeQzk43WQU2mCRuUR0hFkUMWVtolRhc2aqmjSzKBxiuiAw1rLmobYN99PKkyXZhGcTWLZ6FUgikQ49x+v1jkN1bYyDfbEG3bH/vmsOaa/df9gt0hAjvgKViq+PZQAgwAAMQA+stkoxggHsFYgYdRHn50/yjn08Bbn/b6RCPPjWf1wgKJkFHPPjtyRovZp/8YUf3VAAALmiYI4GnDHLMAwERIWmH+GKtGAILXpK1JspdyPORAzkS6QNwVhpLLgmEY870Qwwl4YDXK5DI4tRTc5RKZW3onGSyqQXaR3reqchPQQjrFJEspyfBW/zhT3cauDR037nL+6FVP93iN1OCmJHNith5l/5Z+ucM/NjKFJXG/KnvO4isIBEUgAA3gDNVSWbtzil2tMcp1IyDhQx36sLNYGuUCuz5Bh0edGN+JS3pjX0CXIwL0Op//fzygFKzEy/4cIBw0//uSZGGOBBVXUxspHpA24wqdPQaED7itSG08z0jWDCno9KywBHA50JLTOXwM7Bwd7DZE2PP1dBhNxWlsYemtPiKD1ncTMFmXElCIDYLY/Vwz2NIrL9KsrOgGZRFhfLtSSJ9fljNRJ8jEuUAjznMuNSqjQJInhuHNDFs692Sf1gaCbl+VRuqct7r+V9//8dy28uUXKMr7JcyAwAAAAUAXr6ElC5CyiFyFNsO494qEwVJVkkEwKWkVjJ1xoNZEuSvzH9Jwt/ub/4g//////60AgAJb27gmE0DEEWgP8ad6ZhgVC1a+VwgYJXzLZej9Wex73wnob0TBxuYAaIZeqEwMQQJyS6H44wPrgLeVYiQVD/Gv+Has6sY87SSgrmTU1uFMfpakFaONyDiGsYa7xuUzPkUf3S1seteqYYOybR+r3zmTs93bGnPEZvb+v+l54XNNgFYAKwAAlUASV2VJsIpvVDr4YmbCokN1MdBYIzcAoFodmMM2bl7fhThyyj59tTLv1f6ygAAKlk4YVydpUFJoNfCJ+NEzXiC9MUSOSFZKzV+GU//7kmRqCAQfUFM7LDSyMYLKijHjYpAJI0RtMHiI0QrptYYNYAw0+Mo2w/FGAoLWZc4aFDsyhmSeLYmJOtLMHWh2pT2FHanXwTaNrma9lfV22v/WZ2dTsT3W85rXJ/GEDAYptvX7fJs3xdz6h2wCIBmQ5wF8IQdPpU8v7hKhvfS22dPvz4zIAAlBAAAVgA9usjZg5TWIG3nSuGZVBaLU7V1MBD9G6phwpqbzABJOQ1fwVde/1LcyR/3/1gAAC4mMGITJ5xga5WHFjYyNBkMZhkiQmQgKHhhZITEqGwyJLOdhrkDLqrO8pSiQ0GMJSuW5MpqJIwYwpxq6+qajidLmpjAjbEwvBELrgcbF21uawpTC8Db9aqY+VxT/Qzu5ZxpUf2vm2nsrnf/V8okaHCwvGIKnFPcuVHB4+2cLLQjkxUXy189/y/8RcACndY0nLWAJyRSilXL509MBSFdHJc/cKOs1KmKyPr0fTq//3a10OIFQ53ZWPZBbBMLO//SE6oCMPozaAQwTaN5HDHSYDCRlAULPxVDXVFS9OGONEUi6LxxDiRL/+5JkdA4EZVXPm2weMDSFC10F50mQCUVCbbyvgNCKKECsMBDUQIDjU6pQTpOHA9FaT1uXaJb1UkXltEago1TKJMuEGNtmcGRAfuDg7+ab0wOEkYTMikjSoqDwdm7ve2Yt0ci0bhRmqZk9nXKRXSyun409XKj0VJKjKB8KvRA45ztFZoMh1Ley4ewAFypUQz105EhqMpB648t1fiF7bG9netD5IFQ7OSTnXOFySl1av/66AABUskAIbxYCCloZANCR9HDAVxHpKcQgwgHHEbnQs9m4w6qjbuuUwJq89Klru+7EZjziPq78SZc4obFgJZhaQNYmRCzL5sTOH360harf9mQ4rYjBBsHzCgYGgTBkTd27B+fQSRTPf6qFpl07ni6ZRacPPzS9ZX95kZV6xRcbUsoCAAAkMMJJbChk1P96ZI/XGD2Jg4qkYAYYGJ3olLvRwfDYcGyRkbKU9uY+v9n9X///7knq4QzPCMZiYxvh4CBseKB40NqFmg42tx6HFXZlIphhkNTcAMXo4TTL9g2t0pHrJQWgoWkePpiYjKA7D5/c//uSZHgOo/9UUJtpHaIyIgonPSY2Dmy1RG0w1IjICGic95g4eJ0/uDh3qe0Hby3P1kf5rWVTFg/QS6sObAqMDHjzYvMOuO1rvdpdv/23fKTKOXlVcJt/Ft5EWHGBdOB1QBu7GBfGCY6u2N+I0cp54WjrJuOZK6PA40vGDQCb6eYUUd9H/+3///6es7UAAYfYwweB30YkXHDCRhCZGhxzCCMGES6jEAt1X1b8u6wd0HELo12Nvwho4y2HsGQdl8OQNabKqFW6MQ8OhiVCOjIRABkHI8Gie9BCWPygqJVrW2GEkUJ427G+fT2PK/v7xhxAkbhQaqUJjVv0Mr+RpS2/y4nqXDOlnZzpsAg+hjCseF4tSAAmQVKRDDBRZHAxqBDEmyEQII/fgfKtu25f+84kw+VpPatDPUUEgS3KOnno+j+7///84/QAYF5ABWN/GTX5UNSBRQMwADGpQZBkLxoFEI43jc2tgECX+kc0QOR0tF+Q03WAIfX6qRSWTdWmUnGzJ8PqHJgW4QgJB0IIHwBWxKiE4dRUpC8t/AwkfQmjhbdpff/7kmSLDiQtSU8TbB20NITqmQkldZFBJzptsFcIyAcp9PGxEvPWRwTRc2u5O7qJ2OWeai+envs93UondWZatJ63dXtumlWpLBjGf7bq0ThV3/MABQAkXBR4TpSWbKnaP1goGdpXsFOdCm3daPL2s1HHm0nKJG1fT3+S/hNf///jBa9I56oIDYEFVrgyM2EhnbqHFsdV/BzY3qbrDSr1YHhzzfVpGsPsVMLsSqYbDwRsaZBKDFGFp8o435HvDMK7dyR5mJky8wmvE9jmpNjIIs9bP/j5mRMbdjsjfd09zVu/dkQ9Z6+dazqz1EBgKKcgsKSesABwyCmpaOdcRfYBSc+zvWC4+K4t9mxEjwIIAEXEqovnAJUzvjvSu/+Ntpyef6PqT6P1mgAAC5WNGQCBkQOY1Wi28YWSmXHB32GCoMuIYGGFYJB6cQVDmtO+8YNCODlrkgZbZ2qsJamASuoXDa2wuQR1QNPJaSeE26DI44mBDiDimyEseOmq406oqg+tdqCdqu4jEQsYvwqqkcu5y+Py6y75VAL/zn5Zxufzv6UXc03/+5JkjoCTbErVSyYVbDOB+ookSXKWuWE8beEPyJoMqZQkmCByR8CNbenUshkzNsQfBpRg0RlPlDhQYIWH9CShiH2mWEEIRuKBBSUpYqeeeJRQh3Sq+5hJvtHgODOdAIdisXQB1SywWVvMkwnpkrheqJMA95ZMSPKGC7I2CZC4sgWfJooqgAAAAFKxoObwhxMehDhQEGjpKKE4uNSbShUEFEkeB68IEIDakqQyKagkAJiIQOuudMwuJSSoHDhmLPo4LtrYAw002bumhAmMiwhKa4lNAQW0YBoYpFI0L8jclYBVg5Fwi63Je4Mq0qVu8XkhM24kSk7/yu/GZlyYYoDlF2YkeUiSooo9hmxCvjR9Sv0/LiQ4w0Wg+CBwxJMsYovRNzEwxSJRFYeIQXUKIylosEGRpyDQgJAUXBYv5gCaAAAUhJNeZ/ZfqxJmeiIGp/uVqzwozzWMatysxPWFt9ObVQU+2xH2fRosP///qdcZwHVvcIAAAgDAQBI34JUjSpijBhzwsCOqgHhLpbCXKZgziMrW+YPz5a8rHdlgRCzcmPrI//uSZI6Cpb9ZULt4Q/I24zrKMCZwkrF3V+yxD4C2iutMgJmKIFpkdIRfw8Ul0ipLNOmR0Kh6XVmBexYnL056srCtSh5JrURHMdTdnDYl73bq/kxBzXpSOtM7v8vc/PX78IQKHi5b+7uZMCgoKBwHAoeLg3PbStEc9kSmPDseouegooNAWGZANAaOiAAOfkD5gFu0o7uvvW5kZpuxhXHUzJ3y0wiX///////9MPw+0MP7u8QS59Z+UE8AY6t5J0xD1H5L0iBHHNhgx7AuBMqKfmkUfTH3MPKwGVVLr+ZzzUHCwU2upYAaDYfHhL4mktQNZ+QUESDIzUxjkdrdOa2obxIRThhU7lKwQ2hUNZlrWFIzM4CJmcbPLDQCvrc6JVTkPh5lm0NgwY4BCmgpbIrF/8QoKKBR2P/4UFci9V72AApAAkU3cjs9LCzPaC7sA0S8Z3etwOSQ2gmMiSpTZ8tJHkBKG/7vr/7f/+V/87iWiWDoFzxgQeamYGwYwQHGQCBkp6YqyJckQWADEw8vLu2C3giAodcVGuBH2aQ/sOMhQLbWZv/7kmR0jgQmQ9QLTB1GMuJa+iEiSJFA0UZNpHiIxQvplPYZMgVBVEGlXW4AoAOq0hg0BXWFyhpqjLrCEHgKRv0UAUWHS10RBuKJUSnPNkodJYQefTyN6kPPhVENBBPnIvDGHVpivdF4UWX7fvCe9vdaj5XStmrffn9r9g7gQAY7UxplzJgiQxBNThPMWX0cesuU3q4YnrVDehNk8SIJSFsFUxLREfnKen3/Z+36kgAACnI2YeIGKlwM9jSioAsRjIaeMeqyhhcVS0LDCfTWSHRhCsBPLVQjsLomVjXElXVCDvNEkOaXqUDsFgE89Ongn4zUJTMWazWYdEYlDUT5Z3JdQ2kwOQVSLrV2KqeEq7W21WSjM/1c9/nnZxWn0FfmV/PnWipmP7Ol9Y2HvtNsHQnUuOqIgAEgCCVRRCDZSq2RQ1LLjxf2bAsU0BarqO3lbQlqVKpwLssOkA9RM/Yir+Q/kW/////9oiAFmBjgYFB5hOjjX9MBDow4GDc4AMXg9AcYDEpgMEFtUzRG8qEdaXUpmEpFTeOQJko6rCVDMRoxgKb/+5Jkeg6EMTRRG3gy8jNCaooVhg6RjLU8LmEr2MeTKUzzCWiosJrQjdXWK6ys1uCKq7m0bdWN2pVRtIl+T10zrhVh6JEdGoskxtkjcWOkXLK+5LWVjeMVJLTuIg4d8RWutvv9gL7/nb+vv/90+V8mTVVKv6zoABsCjsStL+uyhhkOf1iF8yqGVVFMM5JLigLXbDMAs6LB1a1F7f9PJfoNyNn//////00CAAABTi2QAZGOnZ1mWFxkvCZIfmH2REKAwUUpLASve8vVKeCYNZkhzgZ0LpaOswqVhgffhxqrD2AQ4kND9SKOk6kTlcls0tA2GHJS06QR9m2FYvS+ZI76FoQQo9K06vO7vOEbiut/mI7mx0d2Bu5EElZmkb59T2YJRtB9GumjNRGZlO+8Xex+n8gAhgIlLWC1nEuqvDFa5YZMHvX3Kfo8oVokCxkIoaQpo6K/20/ly5Bk/BMQjnbsufijv/9JTeiimxhgIjFBnIVEp4monltGxIcW5MWiK0EerGoBaJLtFcB3PigiHxgNIN2jMtB8uo+ay87zZuUy+7Sn//uSZH0OBExRUDtmFqI0IYqqJMk2jsFZSG0wcQDKCSjM9gh4o7ImeucA4O4xmb02JuIghKZyXNlo2nlc8AqIqGCIIieaEiISTWh6/oh94iIgd/REzSJblo7uf5EKUAAS1BlrdAhkDQSL/M/3cyxlls9y9qrAIR+cSGZpBZrdOsUllXej7NaFWpC59f1f/+zIqgAAZsggHzAD8EUZRXGFCJdcysrDBsvqFAsVAok5C0hYNjkrkU/I552ZbkqjZfDBhTMa1Ipk4bLKokl89XrFxQfKBSFhtQ4cEJatJNHqak1h+jdATglUULemRCmBkqp0nmzSng2hF0vb55sy8bs7Nf9edIv8/+HmRsGbNBnu/igAAJgABO4a2eD8OhAVAH1/yuxQHv9VrjecTY5AnKgKVa56v4z097f/px7tF//YL68iwgmMDJxnkAw4WFAEFmGNyIRbkdC2WPLTwGiPB8bZKqhAsiaCkDKoZd50Ydgtw0inlX3AKuaAcjxkumrLJ+dFYOB8uXUNeuVlboH2mqqGdXPtWpz+9tL1YulcqGEsJlMn1v/7kmSIjoP3TtCTbB2mLgHaSjAmUA/RKUBNsFbAzgpoqPYMoFWV7IdWf0T3dqO5mRLnfs3DtGPFAJcKhNehJAEAAz4ZN16JCRxUGIQFq0cCPEgaXXdFa3MgkPWIBjEfhnqGPSL9W/YnVa//8j9RP///KQABxMoCB2YiAUY/zEYxBQGAGraYvjcdRQIMbQgRWNLCEksw/q7G+dRpsuYY5e2SiQwIIZ02FN9jMjWpA0YngnGgZRCU2PpJIg9kwrDSNi6CKwlCKcMMtHSpyiwmYt39ceZij6t7Mup4sVgZtUpd9EguKJ6hVd8UI8rJdT/79/GCShJpf7/d2wADAJAYwoULwuYqghCSN1160rgAV5cgqI0fpp7456VkL5zyjonQtshzUQwbT9//b////7nAqBo5gUbmBhOaPLwLIJiICUZj5GkgDEQEhos6LANzXnMDgN9pNfQlw8wWPNwYE9CTSDcukTc1BosEEKA7QCAVzepMQV42JI+kciGxXSF5YkOYq45XFEV27PQW3k3Q5trcTkoILFS5H30I4Evt5F89/8ktoYj/+5JkmA4EOCtOk7lh8jRiWhodhhoQFQM8bjB1AM2IqCjBmcgVRU2nzwSDaWjgee8AMAAAAiKNOTcT3yGSQHs8Zht7hTJz/UuONIFE8cWQ5xlJE/UIVEQ6vPpr/o/9X///9iUqAABLgayCQcyUTMXeTzgkGDzMDIQ0SOwqCpeo+JnRVrINBIGhoesdxmK40T4QBjkQLgvLI5Zk+5Ie7VCeJAzzSL1IiNXnKZULuRyevRglUbAOixZg64Zzoj5cEJZSE5w3OH0vLmZEWVsmWXjE4lI39+Jm2/5s3uRwHr2NYAAAAAAIpihuHMtHqUiRIIgm7hdEKy/g2eg2GEBHMWGCELwAwu/F6kfDqPlEJeizx/t/+7///+kE0LxHRzNGl42aIBalxg8SmFxQGBIGglxwQEJc46Tg0Ea+1QCpdkxN8/S4DdMc0y4bG6n3JPkwC4YHhAEMfoe3PLSD4UMcuB0QCfnPIpHlWc50eyNZoKDDG7iRb38CDn5zinqYsq/KufmdqDOxwtZ2F0stELs////+e9Q3spmTo8QqImg+AAU/B1xO//uSZJ8OQ9k8z5tvG9I34uoNPYMoEJ1HPm48b8DVjWhM9hhoO8/Tn4ekd9OY83Yl3j7n1ZbcEiqQ96IYykM1ojcjx/K/V7eQT6uGKV/vKO+vb/uqAAABcU7AAChgymKdHmWYivUYmCeYJmwFQQFgHGgPRWMFATIhHYkMgIh68SBQVRIsmltdTQVEquSmhBAECY6uVsC7DAFBxTjtSe1TcwzwSGICjBLL1sEU+gsPaiFQlHIEhgURJgddJdBdQJG1m6rETgKfGTbFU3m1msmQXizUWTym1BK72X0cUl9efMAHF9FCOidYcggQMIFER0mGzYXRMRUVgq+UMONoyNEkoZR6oxJeoQ6Dbr15+ydHjCiBBakkdk8tjTE4QmG9WpcEIKEjCkYA+hKGcKV95wIKgG2kZD81PK9kRYWDKz9gilHxX09su/35MEEkXbvciQAM0pC42EBZgmGRxZhwGOihlI8GCKGCtgYnDRgvJuJhYS7chh0LKFqQEXHUm2kDsqQlopNKgF3ocgcGMhls8AN8MFThV8yoeHIU7zGCC4eCojAIUP/7kmSnDgaGWU6buUvwKcMrOQgmaZXtX0Zt4M/Itosr9FGYWCu52GGluWULzbuQldyG1TkNsp68XJa3C2QTM1IYMgRyrEvnKM9zkTyYPhhTxP088c2EkCt3YJEO2bK3nqBLmWub/73W/5j//33OGF72lNACcVkTJ1tpi8tM00saAADIEQi24AKQseEEPsNxxSp8Z2KmnSbfP07PAOmSspOFWmH1i8QPWo5W+/7OmqQIQkAAADLcwocDRad8FrMUa2tFsawsfZkqyxKi4qvq8hV+s3M9Kq5DaEE+VJUGkQ5XygngxGp1lHUqnzzJgTwxQn234yrE7d0mG9f8OjyQU1MOVzt8Lrr/y8+l1IhmW5fM83ozipVsg+AIw6IzQfWstNd71pDS2ZQWJwAQAAAAdx1qCo+223NKAKRdwHh3Bkc8Eano6us0R+5GYWIRppyhr+V1qufUyLNjn9f7yv/O//+VgAA3dmHqpNGl5FQEWBY0NLhAwC2tkIFLMkDxhcdFql1L15cpTCI3BLQE/H6a3UgRrS73ZXVJZ5R1T7/3G7ZVyMj/+5JkegIj1z3V6yxEUDgjSpolaXAPUPFQ7SRYgNEK6YAnsBjiDwfCrWYu9lGCKDJDQ65EIzOKvb+bjtUjU7uHXvI6VvK3X39HYokPCUWEICWAwWBIs1DlVLK33+HoNRCnmsSE1nMgiLJQ7FnvBB4l+D6jlhCYcqVI90yrRgMq6pEdbQpOeLv8uWMDQCqgzfk/pgCAAAF3QWQIS0hneB0wYUJs9ZISFBCDSFMCJdyeUdEdI5iZyhScNFn6hMqUTYSUvTSnxXVeNIhEBAiunk4NphRUOQ5VtL9kZoEuFdrMal/tmmthvrHxeQtSfY2prvk8PJUKQ1ka+e/6e4klVRZarG1oVTJvFHXpFEYABAADAeIkYnmoEHiQgumRdd5II0banLmI0p5rDevHZ7cvCJj84DXg24RHjb19JVF3PW0sv0woACU5bVTdVMOiN4E7FGVH13v04NI7yn7QTi0iCw+dLtCJZPEBpONDuhGXBVwpBQQFgyUl7BtmQzCM0mZl1HzSNj3veJ5MZHZ1VZKm6oe4LI/YzM2nM8vPOEfxm6lBRqcY//uSZIgII8U9U7tPG3A2ArqJMelwjP1BW0wkbRjVjGkI9hlQbak5eopyRwOuHw5AFczDUQoFibimEPeU4CrRytKhmeUaSDgek9o2ulLYBY89N2JyYs3Yq1bnOf7fmf8/AABLlTTICo28qMKWDtiQKigQLGJF5i6iS4MNAIUPrGgtBx/ZDAIXCxZw0yPP1DL+tKR0i8y3d7FfsHajnMUCoToCEGGCgBTJRGRTL2VDMUf2dnldVIqg0y1cU1YZknxb3CH1LY9XSJmFBYYdbY1hcUDjwaaTmtlgiNSpUSbNiAGVADQMmiRgkEntALirzaQyElAIYjPjqwjctZMS14kBjjfGLdIbfMyW1ITAkOaf66j6Kv+p/9GAAik5I+CMD7kxDa9JaOCBQjIzMnrgvOK+br5T2JLAiRGKXsre6tDZ6rNfSSoztm/YGRfj6BXE4lhrxS2c68+bPbvpYeBIuPoDKAzQtqBCpoZTU9x4ndn3KvFFquYxKoNiw0AFiIEBB2wAdJRC7CVgx0JFUnudScWkqzPUb/aNdWZkVYcJrSMwxdU+3//7kmShCAQIL1EbeUnwNOLKMmGGRgxMpVLsPMmQ25Gp9PGWUOd/tPKoSHA2tpT3//SqAEoQAFJyOaGYA8nMMCNeeQltICopHFM9jFvGunnEgzieTcKONiEQfuL8tvhUVltsD35R3aiYpTK3ehmgmHrodIyKyaFRZ3qIg/MQWCcgVNIr+7OzYRadFHC9DILt0GSzl3fcj5GpDWOogfsIIwDR9Yp7fPcwT/4R29gAla1olJuACSNHuSX9heoQWpfWBPwEKgXKANl2RfT69XJRnr/9FEqpzsZ65qP///+EajgAC3doMMNKHBRUtAJighZeKoTNF0iCzBWGPCaiexT6YSqjPYBoVoqx7N0ZTHjNBSKQ1DMigWWgWPWmcjT5Ba/u/3XdCmh27bF/exYIpFN/zqvKK1lt/lWdxtza+e2J7szuKM+Zcl+v1uvZy/V/2oAFgbrOyVXisYDjIEZDgxFFzEQFIE5EYRwIeFnEnoimE3jy5Q2LjjW8qySLubtTnmf/sRUCAAA+0Q3PI/E0zd4TfGhVIMmqGmPbCQ8sAwCQlF55izz/+5JkuAADzUJT009CZjMnOx0F5SuN1MVKbTzJiMwIaEmHmFj69lyXEsmmtK6ZowKRjgGCXLVSkkjiqts27w1iOYRnIkQJi6fLye4Rm4ctVilr9kUPSkRL3YFu1aeyD219BIQA+zZSVPiHqUz/5316e1slIxk85iNZRx1h5Q6ASw6JQCUsKDDNkh5lu1tRN7611Y+NEZXHSFGzkL104H3ah1mbHh4tAzwTczVlQI89a3nP/2k////oECAETFAfBJqBPGMhoYJDKdxjNRGbQySjtB84bcpYZP8AIRpaQmOeYuy3iqiesuWojuhgpsxZZSV7Y1fKOIRNu9kveWNQpfDKJ2klcOoxgsVOl8ZmD8cTBcWtLDleiM1LEDtOups5dllCfcP7IVbVq7s02vfF81r+0nKvTvwNImUR039AFPuINeBVCkZAABQAAGEYMN6iNAq9TG6LziQWDpwkwpOZoXQI44h3t5OfJ0iBFFIZmu+RSjv0//qv///+6pUCAAA4osZRTJpQtGRMoZwBhi4YmEgCY9E5n4emNBUCgsQgZ6FVXFMD//uSZM+KA/pBT7NMHbA1wjojBwkIEYTpOC5hidDUjSj09Yzgg9prZmwjQAgV0rJaBiEZKgJUDSoelHQBAtMtHJhKRUWnIZkd985qDVtVIYmWgzkllsMwJHSeKhExBKTIRaLkBZA8ymxUGVz+lEJYVJ5Bp+Rxrq+Uha5DOQHMrrPu1SyGkenr0qnBoVU+hzjySoAAGBSABDgoJKYNhga3BMGw34LEfqKRpRRJ0SsNUewlU2bZFbyMkyln7x3/72/1////SDCtphxmmiAUZ1VB0wMGJQoZGAphJFjJoMCjRUZfVc0KXeTEV+WVswGiDDzrJvKlUg7rd0KEATNFBkSXCZqqqzqWSld6pmnQw3KkbUgAFOVq9UTgoqoEY/P4mFSmE/hjfNlxguMocsXtspZaJ4So1E8PM/P39SyX1KDkfv8YIRk+0MnyvZ//SEtu/U/v3LmBABdHBKQJcWkG6mu8nN1c9TGx0gCnJYyO+/eiDJhhFN1xzq+n6/7ptTe93//+2hUAAYdkRokx8GTCMJNhBMtYYKFRkI4GGxSCQCDgipalev/7kmTTCoSpSU4ziRaiMoIKPQXmChG41TZOMNiIv4go6BeYKJvD48G2LSpNIaD8IXqyxUzXnkcRv1K1iMyXybo0b4wiep0t6OUJEPXkdRCloo5IhgHgs7R6y5yGgoDnYpGSm4w1AqpTw84mkaWnaD2SDOn9ZPZ2EBAgRP21Eg9npN3uj2Qf7oY5SR2xHY6etG0gBwAAJTlFaP5F2yQ9LicyVhyEofUubyeUXcfIGBEQGOUH0gMMb+u/9vT0Kd5n/er7OhBO0AAhOt61hSJGMcgzMQUueFDBOsy4GIgQAghkA4o2W/d5r0jrrHTHGlwau9l0P27cKysSmc9uiRD+RqcgRRIQBAoVfPK+IchUqfaQ79K8Z+lWHPTIEZSwkiURZyJsOg6k/GeixkrP4oDQIAhqDOQ/0QThSxomfaj20273zfDA8oyMZpncEYLuVQ/JT/QJxn4jH7+ZSR6MZ5ksaz0ZUuShqaEPS/yzzJ9QNrMrFPGlYplCL8thOBCCUgJYmwHw7jnAbCsHIGyUyWCOBzmyXtICGFgV70NW9hTP68ACcED/+5JkzwykaTFOk481NjRiGloFgwybEV1EbeHr0OCK6qgEjCoPPVRFBXsihZStDftfXeCErtnEQDUWLcGDaP8Tsn6D//lBMZ/IFPUNd1vgMCLYsPrJiA4KqkBGEAAJTuruYjWIqRYKHFlIPpbRZOZD1H1TRCeQDLtkb4lDUziYFzWnSFKPKlwzN8It7gwn4VQpIuZLHj9+S9BtUpDlkgI71OStXuM9TnUsNDCER4zGpDSCAnmr/Gka9YzCV9V2WZvnRz+VyOKbndFJOUE0zLK9xzVBgnKkM9Vx07aas+vhbahgWrnJ6ch+1NHdALMB8vOBzERuAvj0bjyDU2dDo9TlwUni0ulIMycdk2vLG1x/jDqCJASAAABLjXhGrzpVgpfFflwQHLPhu+ga3wsgekw1o5//b//////bIqjCpNFa1PtYouAAFyoEKhGlGPIcPMaFMmJKSDO10BAQz4xDd4mKAZbI55hBxwUiX02z3yhQvBjl7cCRjL2RlGmCIahCZBsgMI0CHA3FkDaaDUjoRGBaxMR2ikJOJEGu5qcLSqcbYXUQ//uQZKSABc5c1VMvY/YworrnAQYOlbl1Sk09L8DCCOycIKDiyl7OFNK4VXThrViLFFVVKUWzy213dJuR9taO63eLpI1pT3PUWsahWuNnjRkoFxGU7mjKx1QKG1VEdNHpQplp0vtpXOcJ5Wzyef3GVLwi+IVyAC2peDRIU1rfZvSwxY7b5OGhUFXO//o+qLxnG/bZ/2+WU1EeFbVkUuzNZgHDQM0ABgAAASVJIBGgDOa5hsinCuY6JvXtrJCEUsi80eUOWbG4DxbtI8UuFeWa8XvO2/E/DsWRXfilpzBMX0KoloQAaYC5oSz9gegqaFY7kTy57VwdTzX6XW90MNNb6vYUMpgNnavdULzJUtqHIhrv6XvoVTtaJ6a8/yokcY01v+ayZg/NsAAEwAGZL/SBVElMH2i8WUxHCkQwh4em7TyWW6J4ghCTrf7ap2TCSsb/+n/6//R/8VBbrRgpwYvJ2kgt8hrMkM4fl5oMhhJsFIbN3TuDdjJo0ksxmEnwv28boQY6CmOk5XEt4CsZzgpy5qh6m1YUdXBPi6qhZ7emEv0i//uSZH6KBBRPVFMsFbIxAkrKJElUEFTRSmy8zcDKCWtkFKA+uWXDI+fRWNx3nL3+RREqLtVU9zku+cvX7a85r+WSjYOuDjQG4G0piriIGeMYy15hTwkuySQDLhN3IADgAr3yUWLDTRbcLQ3LF8TFIFKghha2muOocgK2BgbIVvf+dd56/f/6y1H/Cvr9Xo9aAAACcGQwwh2NIVzKbwFGpjwoIyMyAnCDAAAymI0YFACHDStpM7L2lCtpZSNNWR2MbBmdRZZ7clvKKrCJIrApgjoIzR0pSxGqzlp6iTvzDAnheuIL5Se0wLU2MVB6tLxqqctG/sbF3rtM1U5okEAkJOyLbnEv0qNqXJ0m58WXRr5uWfn05z//wZyaBSHSIZT3hBVJlAdwuAhRCCEXSBbBMj8VrD1mHelIylJoqWwrmsnOoqPBcELR0sjhNAOB1IIJWrISv9KBEoCMjl40wFDWfQMChszGojAYAMZnuEgoXJRgALoGOKxA3Kc1Pcs0cTrUZWaDh4XTGQDgQ5LUrDSkYV0qZBRiVsoYrK51ulpRZT+DE//7kmSJDoSBS9AbbB4gNWLKIT2IkhFo2TwuYSvQy5XpqMMVmGxxtsc23N033j0tAqJ8u5C5Y2QYK0pDRnIyRTtdW0ESisjCjOnMhP17/q3eH6VCy3kMoqMZs7UgJADFQs7cYwAANcDDCSSH2BWGwzk7gEP/L5d+J5VnyYLTZjx1IIh7moyUt+yf+//9lFkCL///////VQABxgJkZgZYjHqkJ9w4YieGcCgJQiIOAgyg7Gl0xwlDgUD3YZYqFAKPsVR7S/chQ5bbXHvi86/D3rNlz+TVp45E+ruve5EmaA+L6ZOsueC4auRVmlUkasHohZlR2phGGxpj1+tpZz19nXvN/9yR7T92Rbv30dtyEWmpk0rSYyjD3iqg9upAADAooRsoLtzEHTqEvlOxJ4caCjkHMBlzaLHCSWMejSIGjCgZcNEqBF+cctifd//////+bSDCVJg8emWAkZNsZsIomIQINFgQB0ssNAmEhQFwYpazZDk6U/IgaA6F00x0en+R0S1h2K0rDWCxl3oHikYj9dm76Rx6aJx2nMJfN9qaHrUe4/T/+5Jkhg6EKkpQE2kWoDUiWjMl5ggQfT9ATjBaGNCq6Zz0iKIz/2t62RWfeLlKLKUFPIqEERU5Q7GdmVqbPdtnen72jLNZLI5X1WhqEnXozo40wTpjLLAARQFGIL8NlBnrySSTYFKJFCGsU962Cu1dgbOz7lvX//qWev6/T2/////////////pdWEqAABCgSlAJ6YYTAChMrNwachACYWljw2MgSA8LiTgOo7A2UU6ZRXGYq1kaqGFyLqONobjPQCCW29F2VSnfWzaVwQJ8n/HRTk/7BCRNKaT28pbn7lnTMenRsXLMaMndpigEE0+q53MjHTcNG0bRwCJlGBRx4R1gAAQIQrtQSgEWsG2JMWDoqhPE6dFFfznSlx16BpWUWZWT00HAcDguGnKf6yyrPpR/9c5T///9IKgZSZpPmXHBmvucSHmJI4snmjRRgg2EAYMGwuGq0LmQngIWkTjrAwXI4CaQVgGAyFoKq2zKpnRklCv5QStdi8TdyISqs/DLSwDAAFZDIKP0ZcmkvPLWk7ME84Ms7BlOp40lBR+kscxK6+Z//uSZIuOw6kuUJtvM2A3AmoTPYY2kSkrPG2keMjPByhMHDAQPKi4I4tLMyM8zveepBipFwvP9GM2SkJPGWU3rAj0AARNFEdKVVESlgIGcku1Gk7r+EytHWpajXakRHQmD7QyTYEiZY8cU+0zS3+1P/5+n///9VUCAAACVDtgVHMKTDsCIFk40Mg5nMJGg4MJAth40gLocN1A4hbrao5p53vVSWHbws6uuQOW4MHCMXx0TFteJHl0wf4PC0Ri8KEY6uyjiTs5z0fV1Tn0QM6meTEVgLx4+UhwklyUHtD0NTJzPvm3/lPT++X5lzUo7jQj5GyyHn98AAAAYMN36w6J9lpS6kKuRhjHIQVh8nrLpweHEfpNFNrTe2yLxGgmJVM+57f7//UxP////oBBdm/phYSYssCPwRiAo4mRDpVxUeGlJETQjYItSPmtg2pV9LPm5+c73DM5au8WqlvWVs2g85dNUuPiNeeyHt+ZSORUP/LJDpTkG9lns51HzJNCIRFjz9KFpFxa8QmWuNtExRT1EbW+u4Ab/AsEnYCjigwoI9CXtP/7kmSViGP1UU+7bB0wNOMaB2EjPg0AvUhtPMtA05UnzYSI+MVXrONLL1LR0XQ0QvWhZ+zKaV5iBGXWiF2b73kp/oIgQLbf/O2qAAATolAk6OCmMNSPcUHHSpzZJywDCw6mMYfa5IFb0UJPAcTmJDJslgIxDEBMDeXrnMOay/LdMIdDJt5BQfH0MCBMdE6g3SYwNk9MfggyKParDFVlNOeCQlTOV32Vke1ATJnZArM7I5VZzeqTER3vt+8+NW3rqfbFfGAAAqAJVPGFmUEscQLiCVqAV461KjrjPbkScVjAstO5nAEqOV2sLZWPhemjHfLTKm+kxq7lfpATsjMyUAEhGKXoiCjLBE7B2PVgQcFDBSmuZgYGSipkZWYQOLMZonSlwvYeAqMDQEmtyJWm9ZMQylX81xJNxF2mMqtwLmgAQ5nd5FZFV7DWc3lS9TDfZpKb4KWk8CoLcTtBNwu5Bw0IaqFtAYgCodQyZsE42B9DUhpkNya/KH8nKaV/izR9MWICYoSUlKd+khQnFjhnYwWQHnqMYKimPcpCfktpKuNCeZz/+5JkrA7TzkrPm0kVojXDKeM9hh4amXM4beGPwJsRqogUjBBPsFjMcvNV8ezel5iohCIiWFe1EdKrKv3g07mzj/9W/YkAYYFwGgkEw3WVfwG5wRszVDZTUVlOkl5XDgZMiEBhEEPXFvTPQrZ6Fb6aIh5cgifXnAAAAp38AoEY8NiC/OXD01xE+GUpwY4KYsNFRgKDY8FpkGO6tBXbOREMTAN80NzCh5+x71bo2AtyGoPYGABDRJMsoQIMkMA1vRAUDsBmcums4lKFDnFUpLjLGZORBhDzaoCQoIlzOgAgtuYwhecQgAIhglku4DwTIHRDR8sRTVZWyra45xY/571jNU267h4b8zwWKM5UfubjX1jWs4MuXUCI30jwUMZ4M7PW1oeqt+1fuBNPuA7mRC3t9L77gH88huoTHTcF61KyPU9HosDPFOpoR0eOiw4FOaM8wAAQASAH7Cw76VHxidulO2cpmkpaBAbP1csmPtXE+3CO7Tf/OhmFkdI/14AFSWqIRGumZyG5t+rB5EjHqGDSYaGrJhOEfZ2ERhiUbIpDKVpS//uSZJWGhtNcUJt5e3IqhArZGSKiDtD1WUy8rcDWDWrMkw5S5iJFbheGqcMiKDQeohmVNn+YO+u0OXMOKdKvVbGJiX5DojHqUXFg+BUEGVmS7GeYh13+88YVDu/uze9BMUKA5Ay1kFmNY0XRGtq2SDxilEUAAAXYeEA+PJmgUdSYjNfTF7qToakOxYYRKeSCiaFwIFoKOvFKyzHbJlSKYs/+z6f//9nJf9nAQkAAClN4gYpEXbMAHFxay2GIEWaw1KlAECc/PJHtMd+UNiZrnUrqD7SQeOsGjIFyWcDyyVrna43h+8nSycc/7NF5tFq2VogUvgijZ12g+ab9QRa+5yiDeptfPr/yen+IarYCep7+7aphblquP5/uU1RbXm6AMAADgBEA6MiZzw8DPsD2tgAbVBWAyOMAOXDsQx/FNlEhESP6SiURgMcHmHMkKzn2JrepbkJRXAgAAFSRMolBjOwsx4yOTFH/Xc1BM14HQLzK6l+DzTLTKrWrV2YUBkTYJA9UMw01tE5wWvOY+0SDAecHJ0SIVKEXD05qhE46qY899//7kmR8ALOqKVbTTDRSN2Kalx0pAI+c+VLtsHaI5AzpQPYWiDw+s2Dp7WgDIFLqIJa+u84/YpbYMldm818rnfbhloHkgAmyJX7ObtvEIsrw5f73P1/cGA9UgNc6HBtLw/uZxFeGqZFc4Jt4NJIj/boSTE6Zct136UBO63it8C634FdxIz62zvehdgq6aKjFAJxAAApyWVFwmViLAFBQ+rpmabDE4cZu2J+EGQOxn8YUlk6YBtY5KQFSvQxLDa9ezZljLsN9GIBCyZgq08zl6FFf/3b4x+dj4bLhHJxy5IaRmPIE0XiqQDVJ6xREV7+k4nK886RTyxW+FYgQDAALkSyfAeNACpiIyC+NUxmJOOUVEvYtVehJJMqZtKFohNVnGaMjTtiyOfNWU55T8RRNIq9/yoAGAN3a4YYcGNDpi8MHGixkWjAiFZ6gNcBBBKVEWADM+UEAV9KJXSJfbyOAn6EtqkVakYE6jH1n0KiIrEkPx2rn7+JB8RLXfGLd3aaPb3n22an0vByO+XLU8zu73f6/qf81slmKLx86SluakoTUljj/+5JkiYIDX09W0ywbVDdDSlVh5i4PGPVNTbzLwNgJadwnpCK6lEmFVVUqYhIEgQSQKIEsFQcTVFylF6gwmJj5TRq07skE7onkNNJNZkFqKAq6KB5bp0qWWhXTR0///////AgJVBACk3KNgUSIqCzRVzMGUMX9Bj4RhsPKYdZbq0oqeurEpdKjzrQg+4tqp+mnjuZaCKf395e3NLRoO220bOW0y3fC0UhoI3zvqcHealCv6ORcMdpq+HP3++9REr9/9q8sAfpcAhAACC3vq5v4Dmhn1+sCXUSCIptIlywzmvDAzFb1apCIi4xUrNE8OIyzggL1/H7TWb76txmhA4QYDo7XvcqRj/dDLuqzuDEihIA4qlbFvWkFj0u48URMis4y+9pIKs9D2drCAACMJAFqlRAIiDIy6FLYT+JRQTtRddK1kEbJqewkD0fU91jqdkgv/gICAGXabMJphUHBhVs4L9IpuTM3Jn35vVUiEHOFjniBoIB40PJqQILlNah4Ve7faKBUKaL2yQAAEAAABTd+fUELCWgh7AXEUeQdOVQx2ke4//uSRJ+BAx4r1VMMMlZjpWpqYYN4C7i5V4wwbpGLFam1lI6QqYT/sfp52OPlAs3XhyKzd5hMXzyFAFBRq9WryaQxkQpPVV6den8oUdZG4mfcpvSCliDsSeIPCAeQPqQUuU1qHnrvigVHe9vfJwFkQABKTkoQqqbhormWC4sl6XqRhWQzIzA0+5zFoG8XLSzis5Wff4NbCwSfs05AfAPBRFHviLUWNF2zylUyLM8zGtbHVrdU0VjK2pKNMgYddFO9c8Idm4irtRzpVElkI1qqpza6r7PVf6PdERD1+eMYABlGAAApUUZRMQT4XmUYqGk3oAU0lgq0VQkcRj3ShVFDaWsCBk1Ve8dadts9v7f/gNv///+kAAYSlJQE0gaAAmL8w6JtEMMFzQkLkIAGeCXVG8QCHHlP3ExFmtOYeilF48KBBIGkQDA7rr8bVpDBH8RYhH68wVVZ+QtLCs+dosjXuWfVt6XH/3Z79at0FbbqmXALMhjeL4Uh3D//N8G/5A95YZuW+rfFpmq+Wu3219ugQAACo47arx9hKaKtdsFH4+bwZf/7kmSagAOGV9PTKBVUNgIaXT2JIg9Up0BN4YfY4IvoXPSN2CVTyaUyokrkAHtEE1i1p87EuQqniwAKHDOtn7G96f/2///+7rUAAAuheBlVGaUAmAdxooQPFosBBY1Q0YG+AkBw9LnZRkcOBH4ToZbH3fTeqsmd0Qg6cD6RRgkXYddXDDz5Fyc0Fnj8UZwCAg315MJlKUr7K9mqKTa1xBiTKq8hvhj3ExP1dWB8rht8e/fF1NdvY1+HCqRFtxivLWlAAgAAAlyCeBswV6dOnG1XKiR4SI6aZgEzwCl2LCkCZwoIjCjZI+CYett+9JG7S8x/f/T//9iJRBozmRSJEmU9oJGAwkMiQAAEAhcVlUBlqxgJPzeWerbMOhG0gnBcWOvqvRKgwQBwoDoOo4HTEYa+7GXqZJg0SVzOTePPiCiM+EwinxcK+LivBJjUeC2iL0RqkVQMqma7mf3fxUM4iOmRjHlSjmKs6s03RXEtdlj0RJTuyojmTbAZnMfSjF+EEeQAAAJKXCAfQKjoXkAHBeXeAWnLotCJt4oQhLktNkOUk17/+5JkrI+DwizQG2kdojdB6ioF5gyRBSU6DjC4iNiJqHQWGDB8T00ebKzQPLPIq/3blu//nP6//6UCAAABdDcTUHsxkcMt6DpgBHgLDIKNkJC5UQ2Zvu1t0QUDPbC2woxOozCmZCxVCWXRrK2v1kl4nyQANK6iMKUBxBbdDpBOTkdyB6w9JBcBBH7yRZGkRHYkOHk3fQlCSPN/5ybooYerv8SE+/vkST84ZZ3utYuLDLjeyc+nnV/QLmbfA3thkAAGoAAApNwSXA5HqAYRZQ5A1QSQNWXm8RYsXJkwzDQqAx4WOVO/FKyzo0eQTVuU7u+/u//1fIFTaLmhnpkpQDks5YCSHELeY8tA4MZulKDgRQWq19CFyMgcAIy/7rRpcohKJDUPU1hlt66lEqvue+QBHH5RRoALDDpTAK0S06JdJYeYQhR+AREupS3dvqVji/UM27gaDZp1h7lQyW/lkQh6UY1JixbmeKKwkKGWySKD7Ol5Kvm9hHNvconn5wPLtqnpwcRHZUqgpHBjJoHZbcLySJAYo2SLo7GCWDMGyMREpvMJ//uSZLSKFCxMT7tsHbI3ISptBS8GlzVpQG3hL8injCngAaQI2kaSCEiRK4Ther61xUADBAyoDiQ9aBwyuxuLuTy3roxAqpFTJdBZIXa9rfZ7Vth5+K5Kov/jDioAAAJ2UGuCmoMAQOH8W+MlLD1w8llqmIMKuw1VeCQ9mXqflDNGJg0LQ2M3WEgrCDrNY8t1uMDuypeQJDlu8gMHnpYIhrckCHgAURAcJXsVboNDKuUYSYzBV2ovrcaK3VYSDnekDNYRabDDtNOU1ufi8SovjIhz7pEzK0kUdV70691CPDVQ2GRRZSwjtRzmadQ6zENy4+GodQ0bBkMspQ0baRcRNqpQR0BAORHoaxLCoCUAAAOAUyedqegCqLb6+DWlrnhcDo9gUxiggiVd//qUa130rcRuvO////6406RIlJ+IA4mKCzTxzjBGmomllyZBAUFAApLoSsI6kH2RYBoDSFcGMIEbjbC+Yf0eSgOgiBeKoucnhQo6iLDsC10xEsLw1Ewv+KiRAdyxXhP5EAhi6SBNDKDiNh+DUicMFkaSJOjlF1nQZP/7kmSjDgV4WVEbWEPyMCKq+gwjUpLBYUx1qAAAygvraoZgApzcwSUkkleip0l9VPSUtFFN1rQomRfY1QbUcdnVve1V+n1I6SnZXZ1Lb9VGyTGToAyoABLtxFoEXSLQh6CD5o5XCP8PTd3+rLSn3hm1nwuux3+WKlvuyRGWJdRpdp7/91ltJDSsblriSSbbzVasWsihRl0kJNARHM03EBpl/EI39AeC+QKat4HFVy3ldyVJCMi+ApdGYEhTtWOwAcmNXVimJQ7FHBE87kvcqSROIP7QS58o2+GFPYfxeMWcGGI49E9nO7uy1nD/tPsxtsrWFzTEOSikgrdegrT8P1ae38AOJNYzFfdh/rU7SWIxXvasOe7mM7DcP2MXfg3naaNU2NNYsf+G+y/Ln9VCCQoVg04CvEkR7bvo4QDTT6qrvUdLdw7Eqb7Gfc/5Y323//5dNaq13Ie5yKF926MEjVm333eqXL1iajUZUAAAoBDgAAAAggAASQdhPG9nJMTs3DoaztRRsgX188SHHQMUwG2NoOTGXCYcAaEEAMPZBQEOSLn/+5JkjgAHJmLa7mMABpErOkzH0AAQPQtZfZeACNKMqh+YsAJDnsLgIqPw2QyAIXNSNEByHF0SkMoXkjSKXIY5MrE+ksbkSemm+go2MEl/0+g1amU7fqbfbLroDmGqi+pap0gx8iq29v50pFUnTJEtFc0n1sZaSv//5pY3f9bACAiAAGOrmRnGsQkpbhQeWfZ8yZRBRttYS3Vy5Gw0gBl3fOb2Zr0azgrm1fS0BymboKGQadvQmDCTG4v3eJCaoeLf28rjWHJqa+t7rrEXOvW2fBiwab+7e2rfev8Z9dV3b+l/n53r13Nuu7VtBhTbJBOlltqo0aPDjXu//+Isss9kCAALoYE8pOBzDodSuqC0jDuST5edllYqoxEvT2CwNur5Rk1f+5pTusuagyVE3/n6f/5K7UoAAHWWWAxuRJBaA1UzRwx4EQB1MBgCZAWEFGKs4YSu55q0ehlobiQzFImpFQWRwCx6G3DXy7EWfaIA6ODJojE94yqbDwTly9rWjRVljoKquFUjNdazKVm1Ysden65FrM5Tvb7ZZsGFkMAo04Nb//uSZDaEhBs00xNMHbA2IspTJekIDSjPVOwkbZjNC2kphgloUFAa0GSoNFqp5QUlgqGrpXUDQdbIwEAAOABYiYCRKwh0QzWJhcQ64LFQYJVz4hQaGhYYeCQdXqtHLTU35cXYiEwFAIZWOhz+vSa//rCBJSblhkWCNDC4j69kqYqgLBVTyMUC7DzzIYaNDbjD2yVlkVBokBrLIV7i4hSesedbL0LG3Nt9rGscSqhcvDo2JwkZ+oS0yTNT7t35qIBDaUPPC9AvUyV3mqc3/7yCxv2BfxpK5O/+HCiAABewAuwRXnx6MA1n6nYkxterBqhnZ6OMsouPvs0CzSdz6Nc2790LgVR17yG7+N3//5IAAYIRMZAHJgAkiqhONnwDAow0JxCDhECTBQlLWmPAADh0PBuMrrd1yGlkoAg1rkYV5YUOrAoDIWOe/T5rBtE3L1/LVg8g2MR+VkIskKRouWSY6eB47b3cPU6eKO8Fw6h0ZUaHTYqYd566Eed3Wbwts54zjuKoKuLPe8R+yzczqtqM8WrGAAFoYSIcygAOxhxi7RF4l//7kmRKjoQpOU+TjB2mNWJKIxnsCBYlQzhOYYvIvIcpKBekCIkxockJp86eQdgfj3BMpbttvsxCxcjItc9zOyk19P/2////9/FwJC46NAhQxuIzJrtOaGYiZocTDFxPBIRVVAyZMjFIW+HSRXdZqbIRoi3K6ORcgIlBtGoGCnuQsZozDI2shUiklrL2l8TTvdN9ZQyllcAsxhEWWCdWG3QT+WPl2wcEi5oBh2okuJ6L2l64kFMwVnqE2pHpSfCSXDYdStTCUJpeeKd7RPYelQ6MWI3n4nUzMHT16zORdkd5X9rbDLqEit2Xm/8rr9acxjzkKS7FoGB6u6UhgAAAPsQRBkBpMYSLMEOqjnVHXiV2XGtug8OsFg4cAqcg+Ztef5n9f/xb/6nf/7YAAAQgAAEp7O0BhQqeAgEzsNcSLA8GFQKVqYqDS1ffldUqjwydPhPLB+fk64Z1omW0JyGuh2HfXpdaPCw+hyy084vRm3BUiZoWBU4dadHFHcE5LSIoCD68IzA6U2zzgY6WdKbyecKuBPg7bXdQqnpF9PNGDvMnXkr/+5JkPACDyVBSa0wb0DaC6hMbBgYP6L8+zjzLyNIJqFz2GJDkAgApwMCPYSOHuOpHmwyh9ZEkS0wY9NZiWRHYRV90adC/bxuNLGhIuBohPgY9/xaz/o0/1DP/WIAAAIIAeZLDSqJhY+CbmMDi9PBhyE4DAgwyACUhj5NERYURcxsBqTzUiFlSE6SNZOoCNFfIiA0C0VP9xfH6m15dv0cuEwhUJP4YldtTs9J4QPPIi7XzFHl+toO/pwXMTY+MN7NFpN0EzDM9wL4g7vv4TP2TKlf5vzWvf166Jh5AACk4O/YQZwDSrmGwudsIifIoelAI9AlOOlldpuVpYk1LGi4mECw9d/X1t/b+v9Qzv/u9FQABwhOnYnBQ4LVjrXjLSzBjhCRMSKBBFTxhByV9A/S1HRZG3V2Y7K25MksrXlhQDZO+lSQ24Cts2csnVmT6JlTg0DANI5lQmdiSQ2cHMoUO4snlvhU134wlJnQzmTk42PmRuZZ/DVNcUx9L5/Uz7IC6b0Ypy0HlbogTgdo0WACWbjVIFxuPFocdm9DGlMhIUDw+//uSZEkO4+1BT5NJHbI2wuniYSNaDnjDQE08y9jSiWfNhhiQ0ygB80mX1Cjg7OoRG1JGsrte+CGCWoWqbd0f9bLX//s//SDCghrAoYtONYMVlMQsKBYhKFYRdyFgsPP6yOGGnqlAIWjmY2IzG3kwVSOTqjPc9zjRY80Sqr0eyLt4z6S0NirCtW7cEo3R5uOnOJFbU27W6PfT1tcZlW/v5GLqOYplJcW9X4oQtYX13Gtw33p3LMMg3NVRAujeEqFHhIGwEQiCK1UNUFkghx7Qzkji/QMpzjoeeBmQMqHAXEDyofpknU0ez++3/9//rmkAABOgdBkCRNCmMyRyoQYqUPYXzDgFagYBDgUqVcSsRRLuzxW1cXVnLm2E1GgXZpWI6fUA4ES0rBRkjkaGxCHkwyPNNoTi7JlHO3zW28zYVKabHSx9OJ1+8nzVHzA7zysXK4n9rPSec9jIV43u5bQpl9+wCkN4ysYAdUaZCgHIi4jg8MXjNCcw89pW21pKEl1ttxELynV1wzlq+BoAjD2gid8br8ky3xX2f/aBogASnaUbRv/7kmRZggOXJdCbb0rSOEN50T2CTBFFY0dMMNUI1gkptMCZEKqiEgNU9Kw8MRFdjO1K2Oy12HrvSl0oadNna50z5dMsImn7k9gtFsC7J4otWIpMUfYxBcLEcLH2YJB45XXDxyAwWKC6Acntn9ooRD++LNUeUQQ97n8ZH3X/3IVrtEN2y6+O2f9u0dpPJ7s7hdxkQn2zv4nN8REQYAwtN//vtsjmOlpQCgBEAAILj+59g3Q20IfR+CNYT3cGBhAm3jPvd7WfcEWwYcMkJOis/5RQn+r9H/l//+XEHn2RikAUk5bmxg4zcmjFBYJfBiLxHRbOdci6RVmeeq+fQ5zHpHwyPIn+3ltXl9bZy5ym6jmZWOl0uEIeHEzuER65SqsyCqVLcWAcpLBS2V27YSRgwEAiDoSZkI8hgjTpQi37Lmc6MjQ3j+rg2D0FzVafPNsHwSRlY28v608a1ELBd8cZbE+UQzC/HihbEaRywmI+UJUA/yCIZELGVIsTAjTLLeeBziFkLfw1UkCsUMZ+xLMEv7G4osfzE+cI7x5DF0CQCngYy3n/+5JkYwAGjl1XUwx5Fkcq+qMkI9pXwXFKzL2VAOAsbKjQC0o3WWI0Fderc0ThB2gAAVHv6XJLorlZm/+99QKgHmnvxRi+kQqPi39R/NYs1uQp3+pnfg4PjAumEunQyMjOsxjIFRv9xyrn7gBm////MhQl4gc+MQAAAGx0NeodQjwOKmgAiqSlIkzJfUxiRp95Zc5bYER36XONIAY4tqD55S7UcXyykrEiw/nZyDJV7820JfBeqJyfH4pSZqOEzNpf3h3pCp3vSbH4lE4rQlx7Q2EwyQhfDlJzHH2LITOpvItdH+AY5Pkh2WVJZMgoXgeixizFIed0iZ0r3+YivGJLq0dVK20DPY0pYlRHzLtViV+BMntGyaFhYMlkY+xAfLC15/1kEc0W5armWhXHS+JNLtqzMD4AukkAApa9l611FE/6VSKgmJLLRWgVHqTsXymz6vrf+/+zov/Sjf//O/////VqPUtdHAWpHBuDFgAIAIAC4inOm+tYPezBXkXhL70wGYhdDMPxe/A1935zj7hDLM3bdVwWgV7s3JJ0MXehd+NP//uSZBqABAxPVksMLqA2wwsNDgyEDzkzY6w8r8jcC+yoNTKCFf7deq4kLI8+4QbPVsukqAiZvsWTKYT9a+Tyc961ldbuRa4ret8UVpZd5Z2Tw/UjCJ00LkR2ZzUy8g6td+V9BxDOY0IHSProqG50cUiAIEYM6ASgeTwpM7gY/kgZjGhwhNBjBtoSw44wLRnQ2gSktfQYmxD3ff89kYYfbk6vVd////vDMIEAIYACV10RjQ6ChFrv/SKlag8dQus1CzXVsmGsLoyKN7YZuKQWXSVh4szivhPaMjwjDL9DmZ2AgV8/V3Ub67UzWvjFb6jSaWGV1q+pqa3q4s7mibW5W4YjtcTBiT22qMMh3t3IVf/EHxo6TconRjc64Dwfriz+jYUSQMIKcF6KBBxyDMgHG4wgQ7V0F/pCvDEGhGxWRnSi0hHbQJPIsTFPud7anZ6rEX8XbZ///5YDAEAAAUr7ojK5CHIWK+zBmCRlqU4sCcNY6/O0qdXyMzUXzeXzxWoZDtVaGCvZUbXhulhRsKYFnPvde44zw8412GUHwoBGd0FgHf/7kmQlAoOiSdjTDyryNqO6xTGroA7pBV9MPQvA3w7rTJeKIBkY7h66iI5Vqpejmupy3oZRRbJWqF9jixP7WQ+o4qm5FYhW1+M/amU7FUAQGZcotlJt3zWzRwerItbfdcZ4VGSFa/pEWvUaAysvLmb4Zii+2thbh3m8WPB+6l9Q5/5f/ygAEAAuaqDeq4ZUzlkTcHgUoYlBIXSOo6m83KmQrDmUajXiZ6unkLMNATYvouYvYxyR9qNDlap3kIuk+be3tVsOAFIK55HIxQ0QnrUBkTf0Ioy+De/Vbv1r0qSG+Lf+amOanpmgXSQfAYdeGCgiH8w5sVijkOLrEYEAIQFQCZCSisVh8uVcPzXfUYIX3B+Te2qNclM79WJU+mNwfrN2okC2+i1kh+NoI2ZP1v+do/8tAJgAAEN3elCrV5SxL1iLJYbWi0mQpwlOeOD3albCRrMoIwvr3grltcYPlwSmDJDiWprwLQh9/0pjeJDQoDtsHHIPoJit1hbO6IBjmZRg5SaJKih4tFiC2ztlvxoobIpt6C3mWbEi+UnUVa46OkL/+5BkNwDjkE7Y0w8q8DeDqrI9iFYPSSVdTLBaSM6Oqoz0HlCxUXtuABIMLx9trY5MzCmW1yCAoOnTuGK5YW2xNEDdQSjEsejgWuJm4dm3Bmm475XGNl3Rc5Jf5bfp/qAAwAABJPeYLFIkGyFYNM2RsZbqu9rg60mA7bxqBWm+sP/AsvdOGPswJFY38zTWpak9FrkpmrFqu7l3COqrT9mrjrOvz8gnXe1qe930ne7RsC337vEnZmVmWgsZFQoCvRtsf2fqqfdLRXoOdcIb/Bf6Q3t2uONRj71OzzAGDMNuqpUz5s3Kog/lVEkVc0JS1V0CpNZp3LPtj6whuFV7eqyoCG1V/KOeVVKf/K/V/WoAARTdOwZxIniAAuwvSVOguZE+ZCqLFX82mDQ2I46EzGIYlJqMqyY0WVajzluRlrM/dWX3kNlLSBbDDZzgUprT2XOMb8t/Zr+ffq3NNdrc73mWWt642/RO96l4bqq+r197o2TGZtUpcUR6sEwE62tI6daZkW9HShYZkyAABWBIRga+2svUCMvPNLAxQSyRH0EpCsj/+5JkSYjj01pWmy8UcDeC+oM9hj4NuSVc7CTzANML6gz0mWKl8To/lgwTXg/qhpTCbcjSK+gLlmkWgyR2w1//9v8ygAEJz5O4G/Y8gQFuMxa+w5TNs7fpqtvPSxI6mpa7Tb9NJGm1PB0UAw46HZQKCVVlWWxQTkcJnfkVv2DK6UK9fKXpd0MnXPyoeXoimmLQx+xam72r00P60c39DWU7lG6joMBEFkDaECULDLuJa04kCQ9hrDDodiMbENeRhP2TrYqK6QlBCIDiPDTyoVUOD/QoY3JYmzb6HhiXQXEifNf/rr/9lQJAABKbqpCp51GBekWFL5JxPCpq9TTiq5FVDbaM+cbzWdTxUpCP0a4P1ZMGsXxlIFGmvhePZEqrZgL/gGo0fXRMGR3cySPuBdXlrOsueY69Fq6oOjeK4lz+Bn+/Gep/fPndRDDh5zmkZAxDMe7LezNnHz26X1OAYAAAApgHqWpPVhCFTDJoLNQlBYYehy0oIopBNO8xJ3A13qvuCXNajiThOTEEl2yXzn+r/zIwAACU3XiStEumJ6D5a5WB//uSZF4AY7E1VjssRDI1wrqaPStUjwlfXOwks1jCi+p09JVq9mNFupSpWt1h1lYDGcxW5v5tcWtCtM4mD73IQGEhA8P6o2rB6b9tgpexqP2e7e347nD6D9S2si/Jhq3dy9Zchh4wcYiiTlZOfdNhU7wyNI6NQ7sZYgiTIinVXyX0arJkkpGjEDEOIJiABBEAOrVc1NR+sEUpgWmiVqI4IrpEJkpzRJviPx2AS3kDSZSnz6hZoSRFR03fOf5dAgAAAnc0oVCB6IKIAzb8txXqBg02lYRwdw47DhAS+07PhwcDUijrOq02+TTXKiDVVMEbAbFQ2MHzxe2zshRQuGo51butEXKFHiI+VjKkMzuUgDGeTsNLttoyOJGQ2HlvKvVLSMyQ0pD0sHTNx48OurY9wAGiIYAAAdgLK21bQug86nlAPoXSXxtg40PY5B+sS4J509SKvW2n9f+/wQUBABn/lfl//////C4TtSnMcI4QiRBhgRCHCiKxdJAGjigolk6EeJVHleaWoBJBDSHGTUUnZ0pq16KvXWzeyIJ4UHkrsMkBG//7kmRyigOjMtU7LC0gNYU6yjBqao9BXVBssFaAyYrrKGSIsqyDM91BFDatKfv7VycbRw5slQIJOoAywbVB2MVlVMHoZmODM1iKYJoZ6l7tIjohuuuqea7W0R1zM9G1a/Fs1IAAQAAiwL4RLBgs+G2BmQi97Oq75xEZkuxCXUVQGf3hHtcIv6Sylh6fv//1f////+CzFQIAAAKSo6kxoJhIT50EDyElPUoEQbjDjjMIbd4Qq2oI0Xxd2MSNETGTsTcRnVM+9NdkUALNpn7js/JsWBTt0qMTSDQym3nx6blJFHwcqwROIMFBqYL6GOvsUp4m+RlRkIxYninyed8gRGO+cbbPplTR88sYfaHUEkUVoSGAAipwJLyoskYd3w9oDiNVdA0cigcSyXGNTgXuWRNyyx64pFj74DY5enOTn0wVfbI7P/z/OQAVNapjBhYQDChEzPWXIEGIpVRwR1qcUTlkI0Kf2BGVQ78pHlaswY6ikZGF22O065taFtjtpjkhzGXRcZHG8DMG78OIymEBZ9yxMDFue7slr2nIPfYproc6lOX/+5JkhgpD5EnUOykeEDRkKoMxI0wOtQVRTLyyyMwJadwXpCArIj6k/QRVELLEW+7qeQ3LVG8DhoKC/1TvuxBAABiAJRxIGhRMSnhocrDNPoqJ7phn8PC+soJ9025Ot6p54KjAIIwsvIztq0L/Hf/rdqUAAAuuHgKfM09Mt0GrwGTsNCoV3S4SEwigIE2HtxHgUJpnCeOLV14F7Yfp6rjR+QW3kmJath5nfJZOaLB2PqawOAW6BpXEeyfx0OF23xzbT2MmNcy29q/s0dTgEKj6GWp+UlFfe6p/BfleZs06TGTzZZfsse+3TOe7YAgAJAACsMaUgYw6XBDxP2Y32VPO1DoyPe6w9dFJDBGaValOmYqDV+fj1Q/wVpN1XeLfwNR/9fWAAUk5EUYzkCMXBrA0NYAA5dLBvQqBJJJUDDZq3ZeqYn4aRqxmkdGBujXgNO6PROP2pVsJmUiw+TBvZYxk5q5qYz3HeWkjhoXH1J5KJEWIL2J0kp5uUpFLh9EQkSh9AlCYQDjIH9y1jF0AcJV1oTqUYDYNgcDOlGpiJRkA9l43//uSZJgMI8s9UxtMFbI3wzp8PQaCDmDTUmyxFJDTDKlM9KFoWckkRVIE+2UXNNlnGUzA5Olyb0Cwt2rm21sF0FI8YOurMXP3SX/T/zQCAAAJcswHMdFEMSKldNEOm3dWG0n2HP7NIXZ15hu9LcgCDrk40hg9LVic92YeOD53G/TRmjfexTztPXv0mH9/FLR9KUgPBkYujKjN5ZUcLDekcIvyIEEIqVPLvP7MTk7XkE2ebmtjqfzm+9P8l6iDrmGz9KZU0RNoIb0lABQCCAAGgbpiC5WHAQUaFWRvKZxULO58qUw/lRcMBTYQ3r1ceNc2pvcc8qfYxE+rp/9tt9Ape9CAJOcVmDAJrqzsuRo5RDLH2gC2kBZszDcrlV3nVlbuPQvZ35a7hInYCjCwVKVtLTMqiQYRGHHWZqXEu50ENF2aSDCQezkj0iq87kXnn8TEBzQYBJOR4kcQVtnENaXGmnXnVi7etgHYQYLBjGeuDBJwYk8sSdiDsQIHINk32VACB0QKFGCdcRpwWi0SSbLbsGI6eCjFAM+8Egg1NV1/6KUVAP/7kmSqiiPiWFW7AzbEM+M6fDHoGA3MyVbsJHTA04xpxPSZYAAgAAAADm0ELlJlBcIlcoEwhrzZnLqDo4i09+GT5P4hhAhFAxRk1QNRHJVAJixSMx5dsWlY5PCQZDt83Zh5TCwso8hi/K2TI/RVTc3zr8LKH55+MooTDpyFz+/MtTO1Tp/+Z8m/FY7BDgtQPOq669v1xZdUqABgeAxnedA0DdaJcFxxf9wm3slPDktI1yS5UG0VmgV0EUSAJWAGFMykVCIOrWk9hZbf3fPGSRctkjDo2LcA4jM9I9ULTlgmRihIEdjBiE1L6Bk7nXJY8kpjC2lJWJHDIETIQaX0SCqK5CK2CdRAfkzCedV9qzReLtVJnRn42f+wqs9wS0MGSmec+3BiqEWMCziXOfSyylPkj2FfI8iPrfZ+SHg/pVvTaMQOANOzxeEgA8J00dCwOlrjROOyhaEw73cumNWtZGWY+0YbAH16xSOGgmgMrLFRCiPc73o/bJIIAAADu8GA6qVh3IlMWqNvwImOKXoSi77iuu+MDxhqdd9pbGZtz5vbZGD/+5Jkv4rjrUtWawwb0jaDSnI9gy4OYT9WbCR1ANYMKczGGLjyLTchLNQBV2wa2C5MvMykXZYg3ND521KjJ4UnPNCuep+wr2b/tPQ9qaCGh///O5HLIloK1p81iU88fEVpk8XWSnjdeba9QBAAEQB85qO2GnlaYzrCnGS7rjpdDATAkxSVUkxu+OWQzqz4FIg2WMnSz9s8VQxzfPf//////9BQDABKTlqSIwZpiArk6BNkIJ0X8xCIQZNEKEsxFElksNmpoREurMQmI2nnN6JqLFmC1yXFxartLaVa1iUTFsXet/Kbm3HU9bp93bvDqSt/XUfUR8G826V6fS3x9rfN2XXBKmiUsUmg499Lv0AADwP4L5dsbxpJ3a5JhyMrc2hbtEI1ZsGd22NWUkY2XhGWJByYTu9X7f9f3/////tUBk0AAAu1xzDrAzIZFUZkkF0ZuK5nTxYOgZgtUxKRgSk1kER5VFWiMIGGSoiQgHiaIAiwvxbSPFmZWYOUU8MhPEKLAT4pWFITHCT824asU6GxcNrFOzNi6e1aqX1C2kCgdJEl//uSZNQAg4NJVbsJHSA4YrqXPSNaDVUvXuelDRjNC2nM9I1guE5XTcKp9a4rW6E+7blgO5FY3Fe/vfpaXr3mddT55wYTDLnP4Q/++p/IAAAAgvBKLw4CzVIGZCiRlMG4LesoarD3Q5DkYeJHqR5AjMBgNq6dJV9GWOoWiphxu9CjOZKtgjj9fMUqFp045h719kwEnVZQRoChyFAOMAIZiHjSZfgsgiMQGvjdExCZTqaU5fEW/LoWd2NJmmq21Iaiq44StUkzEh5e364spFUroLKt6hwqP6sYKmwKGZ7oHhEshtxd7okTaSX6fHzeOc4FBomFzULM6VluKaUhUpJrnvjrnTm/RWvuqku3h669+K9JZ3KEQhBoMfIAABTgvlWoHgXnJWDIwQxF7u0glMgapH0JAoNHKTTm2pIzUSLBQ4G3N96f1D3JoQih76bv///+jpFq1QAAAnZMZImFj5kiBvlI6cA41CYBgYFBrmBQB4n0a/I9r/VUle2DxseDX5S6iUEVa8XtqcbxeEIgABsZJDOA1LpXXhOfjgdHLn7eGC5ksf/7kmTvjiRUMlGbTzPiRKO6GDHpHBDhYU5svQvY6Ivp6MSJYK92ZVsrjWzxjDWv1i87+rmXomm1642ofYR8jO47Ewx3X6Fdg6RrrG2/7Aemq7hhGkccWc8x3hgj9RwACAAABYF2KMciYHI5GagkPkwN4ZDY04n34phfnCVXytM+JBHQ0wMB22t/Hv9EXo+s46ti/////8mKMowASUm4vB9GOOgWMTgyRbjvJuqSfhkNLY/cVsFeiuwYkJ3qxdfMoYcj5qnYejmK6ayFpysdQkHmP2dP4QZaRodOOJbHiudmeVn3TXI9WYmPI/L+WGv/EOvZTLyvT/8/yx51rVrBECAAFJATfTn4eD2LKieJcklNanTIxeLiFRulVU5ce9a3M/eUC1THCz0pdUuX//////2EQZGKAABnCNnWTE1U8JqOJaTRn4+cfAoOEExkxgFRExQMAI6lwxJKxkCwxiAAyBpReCSs1UDXAYEBl0Wr3RgLed+lgEh3tXksZdUGkwQ40OtJetrJfZ+oQ2tnFplyBA1hZJY5jgYIa5KmPBEEY75L9z7/+5Jk5ggEPj1Sm0wVwjvCinoxIjwMeVtc56BvENiKaujAihJ/vq+viXFiFIPrK4vUaEFTGe9oEYgMYKQU7FQxlhZ3Pax1P09qtZrHCAbqMeDFB3qi29qdQCrVYUaOABBIF6tT6vNQ+BqskZNxTYK3NgfeDISfFmMafGF1ril88GOxXnNQ++qK10bL39v//m+v////////////0M5RTAA5LvbGYZYAkB7swfKER88ZZIwsmhamkITQ0ilczD8Ny1Xz9MWfqbkkORh9XOktdSigtRpsMniDOpZccSMOmteocBg1NmuYjCs6J41aZq3ydJzjdCT6nTu+zN1Z4nY5AylWd4ex/fVjvl0/6a/CvPYp5sLgEKjPYX8svJtDPBAKB3VJlAAE0AdXGGnitI02rx/FJct51Lg8m47SsNpthPWrK3Vra6ihSghRoUSthudqcQRXbo+mAADmGCABEDYdxMHUiQA0TlVIwMQMARxIwMSBDEYsChS7QsGDAIrlFlEVIRdowAiACAQCHA0Plkyz8iLqJFK4mEc2YtEY23fjypksJzlk//uSZPYOhUBaUJNsFqZBq4qDPMJokDVfTG0seIjKDGnc9JVgTflO6AYfceURaNz8SHu5XpZsQDszJq84PlQIl9qJ6FDS2RHOwM1rUlbXKslJ7t3jGcEsjqDqtRSltdGZtbXqTI69NWXuUzPLTsTchKDvNwAAGgAITBB6BMjuHW5nwgULH4Nu6LA/CpqxMTrsmXg11Mij3yd3S8NRxWewUHh0EkGb2OdcztxTyrwnMh8BShm6hrBgG1kMcyIIqkWEE0xfquEM3YWMnfEc2vr0fmaGQC91pxcu4zdj7kqpy9tLy9pTSROOxGbX/BUubeNMSeRpkWpXsf+vQhSBBpJnkilGtAqxT2f7d/r01zfkZiIiWIkJGSmv+Vn/+tyfXNsi/q+VOl5lsudP70ssv3CODJZgAASAAYbDDNxGn4LXBSF8I5VXgnY5Xeh+oymFgtzIqpkpnjFtM50yv/1CuDoKn1r5qgEEAuX73SI8ggKo4GCJmwwRAT7QVY4tm1t1YAoZfEI20LA/A2gL3CiOZbAouSysM0iSCbXKehaIEKlVW2tsUP/7kmTmDoTqV1ATbBaiOYL6QwXpCpCFYUhtGHpAxpFp6PGJ6BHR9x3Dya8GEokGRGQD7xXZxMIqRIpomNIVP1f28kA8Uu0Mfp5fj08ePpA4AZLn///31yegAAYAOnz1NopFYE0rl7LUdATG1QJEQcWiCErpEISx+72ulFk+6wRARFLxC8oQTL3emv94BhQGOSBjKS4kATLhU3EFOqLTLkUxANCFsLkZpic2o8KFmjLwUMBAUDEwGgurC0QKhH/vsI+qxFKhR5/SZ0BSSOkZF2pvLMLmo+rYCzGOBlIABky/4IGoeBil4HafkDILuQenutZyZ6eddQmGHNe59n0cGSQ4/k3B8BtOj8p3Lo1D8rieL/5SyX4xSfmJZFJTNyylYeSsZC1FVvs3MkzD5jtmvFQ62j78x4x2x3gyrKJ3UZ/e/97/d/96+hOAGVwnzEL6hY6qIqMwNuELD2m2hHFdUnYKWdE/XH9rS6Hpz0CSICIkTj/bgmJdPDzo9VnuVONtkBACAAABcmSeMrxAUQQdAuUtUKcBpkGosX3gx12nLqh6Qxj/+5Jk3ojjnEBVOywcQjMjalM8RlCXfV0+LeDRyOIO6Uz0mSh1Ig9qy1rvCyN4HucaYehriZsTY1ulR7beWS6lhuekz/R2DqWLT2M3SyLjjowIpzB5cS0YwmdnIz1dQvwr0z94ZHmjJg/9E+Hqt+7bewIsHoRGa6O6Il3LgrMHw7lqU9Frk0xgIMAAMwHYimBFEbPJlYOvB2uQccs48gZMUERCyqXplVmzn6jQwX3bPsag8H9akf//////ZwpOTQJIWfVEjiYGkIi+TN0kpSnIcB0EFRivKZjYy+pAs0QpUSSlNogrVZYeFG6jG2mU3WiVTrGxmo43gT3jXjkllXCCfu4rOTzkJcuu+sV4qIttlil+l83YO1IGnuzM7v6e379v8b3Xa3/d9zWp/mujMpYiATOGCkmAzJjW7AACNAmNY3Rg8SBep5TqsimDJBkgM2cYiJfrYrCnX0NoOJmojaJqzV+dhSoWHj3r+j//////5GoAAfcVHIEtDarjVFw8igiAlUknmSJjwoA2VL2IpAKFzaULeRcOM46wpXJQGJlu36Qn//uSZNAKhDxWVNMGFrIyIzqjGMMeD701Vuw8y9DbEmqcwxXaDZWhJOloajPluRIlgjXOzsCtstBDaSJ7uy15kTN70ZiUJJGQOYC5GOu74H2iIITXJ0nojS7UHi1o7tRE0q+c3xrOm2kxQmu/e+5JdtLS83p82tg8qEF8Y0Za/6VfvLUiCC5OIZiPJqLYZFGqwZIcJAYIqc8hKNT1QuGgZlZpLE5R1+WTF/i+DUKCILgGXXTWv6AACnvmMGMHGVqDX4DCCYgXzCAgMKBwSYMU2lLlK/oKZX9FDqXF6+kzWbu4cdlCcL4L5cyPtblvj+ceI68Ykk1ZCo7vSNtdA0cutZWr3tfLK3je9Xr+ogX0sy0KNFPitoPDudWcyt981ULYGYKFVWmU91KjojooZWFjIykJM7Iu18vtC0Q6IU5CD/JSaJ2g4ibvfA2PrEBihDuHx2hq0LovB4tu/WOKG8xcSATEHZ5X1qzDHt/R1+gAAFXVZQs/My2LVmAAGGKAJcY1UYU0geRBDgvSsE6ICCEMV6SKEWAIbBFnDRU4tqrM4OIIlP/7kmTXjOR0MdITWEryNEMKYD2GShB9X1BtMFbAzY9phPYVMNjFA1pyQpeIYsfBoLgvQryhcQyVE3xKQXTYvLecLNLQa3nvCOjUwcozHEpWh1HeNzrWT9CWCOZ8/7pHChSdCkEglXc6XYXDOPRCCMKD6ixqO+B8AEIERkHJUTEx1ITco6BKsKRRJPCMygliA9YOPlQPCCA1MeDsBjAEHSBAR4VK2q9+4ABKT+cMgAASG6CNiErECCrIpa0KdPYJHpOZMdFOCZK9jrIlOsyFmtBFX9avE2owHEI3B03I6blNQYW6ter1gV+1ez+zKMrwTNGbm/6XxVARUSSjV5E2YQMNATpsa0jIODo8JM+Fe58nEn/fP8ivImZgiwqMmW6BJwn/H3JHkkAAFiAZgK0fjQdikOogqGYFnEJITLiW0EVrZg9zkjVqu5nFLM1PAkjXdupdvT///kIAAaJBQEQnduHnSjoUgMGEbGKYgUWWUAwQFoyyyYIEDBYI3VN6OwyxVejaLzjC+ioPSOUNWETpV4ja1JOG877NW5zDavG0qHYbfFT/+5Jk2YyEREvSm08bcjAB6lEJ7AaP0VFMbJh6SMMMKdz0jSruFO+/luOyaVPogIBGshkJEKAowkj0QrpORxFmE/NARiwTjmsIwd36eDp9Pf/N0Y6y0UxfY3pi+ZWuWdCKSeIBmJJE4Zq1/cW6AAGIBVqO8pSsa354jgfsgVKvkdT7r5g5Y8TduCAJdBauqswJKlBparBf2K0f1f/sWE5GRIIz5WDJhASwNWrMEHAtQwZJb7TTcClzsqbup3mvGDnkb3JWdqkZlCCFbjiuopus6G4OnrdKyl5ZuEP1FGFQcTvGpnG5IZklTG7R3eTZiiWQSgIFvTnWCkWSFPdJeoRx0EQnaxsspvoke7vd9kQ5l07uXSPM36v8t7AABLUEBQuCUoDoYBObEkxD4prUT6mBSlYMAb7xY8NSYlYPWMYVUp5Z35tWr72+/9f//6IAAAJxVUzrk+6IMbk4A7uE/oc0+UQOU5zPjDNoU229SMgiGUYmYI6rDJVo+mBDts11SckY8x4v40plxaMuCq+DAYhGAgboAuA+DIjhivXrjc/UGeo5//uSZOSOxJ9N0RNJHpYwwrpTPYJID4jTSm0keEjLh6mMVhgqgeMCCzZCiDnlkJGgECCm0t5NhjUYN3UvKPa1lQio/1lanlazb6xjVzUGLezsNNKzNDnf//ZlACEQAk5KIUoSpnFogHbpdJA5EcwQ+yDGlAY5UHlaOO2iRup/lnHxRCjFi/50FDVU2HP13oxz/xC55+aKG9xlgKmh8BnTxcirDM2PP+PMkMN8mApczwov4AhgQAJASl7+M/UzgKEK/gRzxYMnjTrOdmCIMUvGgi5WFJSMqtLjdyAHnoojBcGjWIhKIKc2Susq1yE3qOZpzNENCBRcYIJYGbR5WBpNQ2xFPyp9v8/8v8kiMzES529/OS/5XsLgM1HX+lZ4RqHrFftQkk24KLhFmWj6nDQhaMkitqoVD0JFr7/RlFttGiybHefaibR/pZIjP9H/1IqusfUAAfJQhi5i6ibABEVcfThGciZn54YGPKdDwaZ2UgIooQcNILpip7ivBWRDqAJwOJwA4RpDSALTpExElZCagSQXjmdxtl3K9VvUiYRMTLJKSP/7kmTpjgRWL9EbTDWSP6HqqgWGCpDNOUZtMHhIxovsqDSIdlkQxqdZUiBfWTykrSOeEkkkHMrpoAnTZ9TZSiTnk9usqITxW5m6eTX96kf+vWmzs1vm78sIoC/eXccrw9YfnqUBiIAAWpsO6Qgchdng6BcU8MXUIEz4mz8bhYhXQO/xWmQ1z7yi7LU/7db6n4tSjlBIYbW5P9H/V//XgJUhBSblxKAv3wcJDgmNMRxk0YHdxfjaKAtNEdWGMANhauKY/vrXHIDtuudVZzP45Sew/F+tnFXjX68vcqnT/Evd/LcG8eiiscwlCox6JPGHORI4fO4olznuXesuyUnaluQFGMdG4ofz9ypY++eoqY9/epqDNCGU+t7PggQ0MkAAAIAAACNwTZeGgKH4/nVDzyupIaUqa4uqhzJzrmV8AMah7BZ/qzOOObP6VYCEEAAJcvgkEmVpATgyhtuhSZKqHzym6/5Ax4NCmV3UA35OeaXtNlJyA1IoSm1KQXeT1Xn7QUjvlUu6/FcUWnRcGsrAyyRAjw1lE4+Zl3k5+eyJphMieHv/+5Jk5wAUgDRQE28z4jnkipo9gkiP3WFdTDEN0LIKqnj2DCDm+2ghBgYFxyi8nkClr6bkbCbBoAABTsEg0JDU1VBqQ2bQU6alay2zhBYkWXAdEUbiRJG9Qk25Sfoy683tKpP0kq8jGEypJLZdnvET6jYjEJu+gp31fun45DI9JnDC6ei8vIgy612dEml61MYkLgwcOBEwFnvA5YoCDjguOl6cgUt03I5MgCAggFT+WEwQi4kQ0GBqkRwsRnb9JJF8VI4nYW3cCOo7Q1yhETwV3GjoI4F9xL4yUieBBieBFVw1q/+0KNGFGDVzCYvI6LDMsDiaZ/RBJohL5fDlIxf59BSZhu9yV18XvgaNAocBQYVPQ6VPExcAChEAAAFKfyxPEOuWYNhgapIMLGc9uSVyKJoMpgCY7bo63pya1Rq0FMyR0edDW6ORk8TUkXWoEVPEXnf8KFGfMalTBbmR0wzFAY1cf6IKZIS+XYyUmF0xSZhu9yV18XvgaNAocBQYVPQ6VPExdQAAgAIBTlUaLyiRkUgcFAUpwqZpjyK4DjHgnNge//uSROsCA1s+VNMMGvBxZSpjZeZeDcjbV6w8a8G2GWr1h414stJop5gZaNtLP7PD9MOSr8mPfODlduvFrU/1I9203pdSthw9EM6dM8T2kJO/uXNASlgjzns+IWEENQT/eWGROruSEZoW7yGc8ktBEHMTFIWg5UIQwraR27FCCgV7UAEAAA4G1IPYCVxMMh4qfG+nyc/LlX1r76/Sx3MsERMBNWcXSueU6NzY6suFDMWhVVG7uu/yf/////+xIAABdqHI0VxNVNImoGrgIOYM9hNRdJG1tGvzgSD10X3ZrRBjcP4SKJ5NzVYOrUpkz/KJPzLBBGA+HLi054hhKX7VjOzsSVvWSOLj5t07jtbNF92HLNTfbdX9TOS3rR1OBYBmwJr8k03btH0he/MUpf8V8y3hppaphEJU/Ez/+UICzIMvK45Ea7XlU4KiWLEJrNSbk5igGVFoLbdkqeID2rsVl5c5BPsickEoELH94f9W7/N//////5IAAAGN0TQnDHATCmTLxQp9VhG1oR7fEDAzck1jSJeRjT7vMBZQ7TPV2KNqaP/7kmTNiKPXVtdTDxr0O4L6lzDJlA/cq1Rs4YmI5wxqTBekMPIuBjsNxlSwxB4zYiH31AI17WzIbAkCg0kNGpI7EJkQIDNrH8rNtxmqQmHdjZ3bKQeZgcnbVQ9xGrWxGYmTFKTUD0eaAcxmKZDqmlqTWN6FTl3Nmpnqn/unlPJ7WK/WruPnvRLqSeV+Jxqm7VfQsAGAZV7g2TK+UJeZatgk/b3qqC7hVjObDOURe9sz2kNpTIiSxRu4KxeqZbkAntbXjsi1Gv7wZ6X1/Bh3+UAIwAAJub+AA5hRdW8xAAcCguBaFG17weWoXew1fJd6uvaAtPn67UNlExRoUQGcXytiaLdKk8eqvNrdgIDNHtSzgxuqslowQDY0X6kCwFCRUfyazqr3MgtsiGuqF//cYc8MP6+5rmq/1la+rum4te+dvuhsLOZKS/R53mm81LCTjGcxyooPxHLMpAGF23kCfV3a0A+BV4rq0wkNzNA0XkHHJv8YHZkf25vBPWyjyv/I2AAAE7SVEgAMIhGUZkyANuGZFmdkgIgvqMGJHiACzBuIKqr/+5Jk1QDk1VHSm09GkjzlanI9BaQPpSdZTL0PSM0N6cD0okCwl6EIfLpzP15BOw3kaLOMWGJhHUgA+YW3AX4/RtN9mtXEaAEV6wJLMgpqLe1q6zYXZHTW3qHFRvtExemJvjZkYxk319XBHdQwOapnfYxXcpj/5Sn+urJLGKkq4B274fkb+YAGAAARQAapeHtdjgHljXDWCAViALTSvYnUsCTzCY82+Bam4hrXkY/8RYgvwa1mErCTv19ATsEZwnxleUyxM3hEyK4zA0AC2qqBEolP6ux9O4smuYum7bO1NF5KOPq/TL14N4omp8dCr9kjKUyZPNQ0xt7GywPSQuVvSHD8NWZmVyZ0VrS0Kt+5PTnauoB5AqjSuMJbkdlUtTTy/1SWEp+R5XlR/2Kr+4EVpejy8zhRcdzJDtfR2+b/qoAAAAAAQnAGC2siLN5LHUNNv08MRaqphnsTbzdailjoILpHkxGhY5bsr6Q30jT2X6P0pTmv1QCDJf6FMI2gaAaTBQqRJltGVrMSUBabG66a19nG6WtHV9Mkm5LUmYxPKPji//uSZNAOBCFKUptPE/I0g3qaMehgEKUtRm0kekjYjam09hXQTnQYFFXCemY5K4Jk/JVj13VrtYnktZjXPv40g+XGN2yd4QlBZAuYgsuKdEp95GahjETcv8wsVQ//2fd+qCN6UbsbnjtX+CBAAEJiDRguBoHFc9sMcsMmyueMKS3PuKIGhndZbZfjqEA8o+S/tIqV/fd6/////6gAAC7WAGQRnZkmTUGVDmKok3MDBwQeTGU3dxgCgSf6XLTi99KqpAaaSswkJiC0GQMkb9lwjBpBKnXshtjLWRNKrq8xjGctJgVYMtpzaRvbsQvxdphRpevE/s7ihYRPWzRkQGNPVCa3do+BkZz8vTW8LOQ7VK93lMTBKpT4UpOyNicjK6zGwAdIAHuQCpENSVKmueEpoH0dhi1nFS9xpE/X/f///gbodRQwV20AALFB8Zjap30AGLxaY2MBsRXmKBMDQCYNIgKBZhghmGwgwUWPAoTShGGZ6S7VLomAnQbMUaL1LmIC1KzNPUmbkQBSTQGBxhVa77r9UHSsa/GVK4jDYLACAk1hYf/7kmTVDCOTMFQbDDUiMGI6hyXmDJCw00htJFiIlirraLAK84SiWER3wFycO5IFJ4aLo154nMXmS89a6zH7UVtI439XTqa20vSOf3tqy90tX/MnHdfKmB5CdZ2OGMccSaLMDqd8uACnRhpdEOUynYFdZFuTxPxpvaCmt3LFI2cvq7/ubE307sv/2093N31vqy5l+nPe//////////+iDhY88ThlQBzCMUMjnzLlwGBJrgMZQhETsYEXlgXjrCkBhdlIJ+YRbUYf+ga04acyLEYiD9u0tV2wgKKAlQRnEZbnUd1iNVr0Qk0Vjz6MRlM/O3aXLGK1Bp9ybKUbr6I7z8QTmucjPqRxCIrLfto1FVqfqzjOTK0/W8NAobeQPAZ2ykGSIALckgAASVFymkDbS5RDWGqisdFoQg4EBA4vp6p2oq///0RGVRMMQtKqAAALlBIKMorE+8QzCgQBpSMhl0z8SiIcCwxDiyMg4EA1jS1omYNADVE509AsBGcy4YAxYBccl7y0QQBF7mCBO7ZZ1m6Vi12hwhQaUzMUb6JzzL0W5VH/+5Bk7Q4E7TpPk5li4D7qmoM8x3bPvPdIbZhaQKMqLGhwCy+Vo35h+69ecAfIYpKas3IUAYL40wpgpbPlvhYsvqKXZxqJaUJb7BQ3oY8EpaThIebQKZXGq4PyjHVtOxISE65Qt2OHT+FahCVoEYBAAA0IJBdZznZTJQRzjYWkhZZAeLPExYEUBANGlYaq3H6gZzUldrKJGme1v+2dP/2yjNFf6v///9skVABJd+hwxBWOqJwgaBSsMH4sKihYKmTJkJENX4DbRycbTwuHGISxoaApQ7sTd5IqLTjP19T71RSQg3pkwgeigYBLWN23xmeE3cIGVRbBYF4MUN8zXUcEM50GgJMn92Q9ykhn1DLLvirzyUufOT20Jgemaz15xgb7zRVhssAAApT4YQwCXBuHMJoB8tHIxpQ0JdFiHzhD2LILc+hx6kAFkCS+7FEm5w8ZVlqv/7G6Vf///XUBLlACk3LnoEBi7arwwkUXcpmzlzmwKztTWso9Low3e1LKevBTUsoktk016NPflc17hm5Ma6n+3/cbln/Jw7Y3tMRcX4z/+5Jk6YyFAVhQG4keoDulalc9JViPbUNKbaR2SNkJaajDDVg3Ks5Ppw8Fc7GiTkIWRTnPfs/vISpnRrk/eirDM4Ru4wyTnEf1eGQf4/gGAEmpJOgCEwmH1igW7g6CUUpr2qGWzPTR9P4YR6FtP3uj3QTQWUXAhxqKP4kOcum7i////rHgAAFONaOqSP6GEJQ1CEzGQOAgSSlWwQhAIBGTyqLPW7SxwEA4CwFcOsUZKy7Mp/J0G+kXqISg0j4FKiKIvZoq46D8HoGQFZo41AizLVxUlhcqwNQU+Tt3KwRc5lsoxCDGcEW/fMksPRJNBSkJQU3IICBic0E1IxmgYWYZ1NrJz2cMFa4rIkFhRaJtPW8vS75RWZJ7bgjS+XSjF0keXfielCAhhIwpBiczbyF5+CM2uJ0jz0AFLIgAQQArZ0tPmAuDYGBgFxYwUlhZPPO/27/9z+if/7UVEbT///v/2mqRgjEDiHUCAAACl6BatRgYSIA8ljNKLeJHCTes4d1k8Bm9OrTIUCy2sC0dZjHQTQ/yTIafioYTeEhQCuLa+LGe//uSZOGAA3dJV1MGFOY2hIq3JMUqllV1Sm09L9DCLi10cAvW8NkJ0FcWkjmsIep1ScjDNCiTyxzxc1xlSRdckkRilUjPvckZoqbWr3l7trMMbs2hEeowURyYyD/RHLwipCc20Y2cKzwqy9n3K6TQUjgvCClwqU5SXnUVLmrNmetprRzLbYhcxRArmmU09ApmEgkpOXevFIFowcTMI6Q3nTrGLshbxFspSoPK3dll7f392Q/+3//fZRajZHGA8QFwSnXrEohGUT0ZUOa517MyFivg35vH6znA8bWVNuCkjKuEzHOIAr4859ack8rUeuldQ56KVm4fQZDWiFY6TsJOskorzjUERwz1LSgcERCtwi/fa6zjULqWXabGwLXLIza9SanjofwymHWRhcFKsgDgipFcSkAm5cONa2IhxEnCgCDKAABJuUGZ2BIVBDnhwgmGMBCsNtsmHTBta4IjnoLtBAMV6/pU7jBuzr/6d235H+v9T+lBIAAAACnWFmlYS1DqZ/MFRKR4W0PMf96Je0h9naydKSbmd9Dak5BQsHUoY0M7UP/7kmTcAgUeXVU7D0twMMIbKizCOI/87VzsPSvA0oasKDMkmlkfLESQzUmrDhWFMu2kHYJgjWyr7FG9TxIdXC00CSRAQZ263KWLOwzcaMevTROfd5b59edleWohLtCcl/cWxq/21OR93BGKiruP4vf7+0SG3SgYFAAEE3xhVZ8Jx5Tud0dIBKWg2PtOEUROCZmmrlL21BGiW9UeIdsDGP5Hy7P//W////WAEgALkQ7lowsuwsx+1iK2hYwRsjwbjphQtkESWHmJIxRS2W3YNjMXd97hIFoUOQS5sWljZJE78PXJ1z69uGM0tl32Yzy7hlfnz5c9e2IHB/DVz601WkWB/mruuS7tJzbZtio/gwFQA/kSa87PgP6s1svm16/c+XY26hLOKX7imgXOm6wAMAADRUAm6tMlba0TSrK/D4QQNxBbIzQe9p05sSzX9D2zo7CQOrfs6ewRHHUqoC9///zKAwAAAreQCmGuiqF0DOsQUW+YIBtGkU69mzOGyZfp4nmZadV9Ii+LyKh6fAmkcqE8MJnUiSTgwIyvudC3VXuQkFL/+5Jk1oIEBTRXUw8zcjOEGxoNgiqQdUtbTKx6gM+Qq6jDFaDRa5lm6seRrY+ryBQ0rbNMhNoCw435qhpw/rjjtzf/GARInfruKi5191UcnFuIXGkqvxc7RHMXXz8xDRE3m8691UHktHyQ7SAgAAJRwHiL6CBF1BAb0Eo9IryhCaTleGIzlh5nWztRev+g5/wsr9dbv8RcWf/////uDCLguQgBmIZjUAw9gtsPQA4IY2SaCIKBnQC4RtUHYiMgtroBoHGh6VS1EjClZsBnNNl1MqhKLKEvjsvZIYozujuvpTKmDL55T+7dNJF1RSp3f553litvyvOqoFCIoZzvIUeqlUstD6LEgoeZN3ZSk0Xe6lZRmIgVGbvaGfZs3itTvfvfXFOffrZrYAthxhQRiSSEEaB+EZ0J3liks4jJ6NUo4oU2AHEHGxJzB8hksCD0Tw/+FP1TUSbt//+hVQAClN6ps7mKCZ5xGIlwKCiloO/ehzBkf07oATpuw8hxf63XlS3ZuIsISJfi9cPSLCJC0CSA+4UKtqtOQSNqUg2kaG7M/nVZ//uSZN+KREhbVjsvQ3IzZ6rnJMVKkQEBUG1grcjMEuqIlgh4B5BcvUCLhhRmaoRiSQFF/pqv1WDP7Sdkyvp/x4Rj7V023py/84DfMjtjyxPi9AYXf//wECAAAvBICirGyeasLwtCyrl+PxLGGYyiiOI5FAmwk++PuS+/CnOvP5LNgYiKSvh2s79n//Vrg8QUnJbSj0yhyAtB1a8EOArO3edZxDTP4w42pMwLv0VHyxHQK2rieSAVqLNrX54sh95fl41u8nlMSi5v3hV0tK9rMTPQPRp0cmO7llpDejtEX0vJtW7kYWq1/djN8x6zzcTdo62drlE+/ju95p+EZJy7+FtQ0B6kGofQLDjvu1mCwsJ432ROwfBYquPIVJxaTrCU+tqaLZXN2oTdcKVHHneQkIzvluaHevElNj0//+jPKgAA8voVDUfPjAs81IJMjRQxwMVdjDnY0E0Z0RLRIo0KTyiUhi4MakKFwq3s/C4G6jlWxgFqfcVYy1iH1gi+hcNJ1rj4UMX3MMqiZe0KhhmH+bvSZyH4pl9rkwMhQRnXoaPkdv/7kmTigCPOP9UbLB0yNkK6iTHmDA6NQWLsJNCY8w2pDYYZaFkKxQFxMiioWmquWlJ2xmhvdxvKmT/HZtbdwhL+pZCv7uGf5416/8G7l/TpvzZXDdh3Tgs1cENDr49AAGIAehbD9MsR+TLXMwhHpIpTwgKdabQ8avZTIiA2hwhiBAdB/IITfKjycDiMkIh5Q/gKB/FAYjy9lqRONFnj///QCryUMYA8ZUMZ6maUMEXUYy0aSRhzBEGMMFT2ht+SIJ7X0iFrw+taWEQy6oG8y+IVMr7dykkitzWG3ahG9vVjRwzdcR1p7edzlSXVVY+8YUeLfch5a8ORWVfeHBBJkVtUXQ6YrRHqTRk5lK3sWnfq6XRbSoYrXOsaMs3/Yi203JAAWEBwguCxHIwkjLavK0QSOcJ+IdJxmy5qE0hokGZYqa8kKN7k4YO7aw5/9bVjUo0t//66AAALuJUAXOBgoywg6L41h6eECExhFfYsQC5ZhgcFkaS+3ZQjZNnCYCWLEVuN84ESnZmPRFimhbJBKtL1DVBZ+oRvi0qqu1K/8FgJvlv/+5Jk8I7k6lBSE3hK8kKjCjNh6VIP5T1QbRi6SNILaYyXpCqJjC9E4pvv1vT5PIxObs1W/XXz0DIB2HHV7Il70YCHFStxFJJ4oGiZdyw4AAOABAUJqAPQyRTjXNEO4fLsM9GmknXLpx8sIp/KqqLYwiHkDVBRQtb/0bsSiivHOV70iUyU1iFKQqlDS2EcjGWjZkjEBGcJUjLhTUiCiEGeA5j8ANGaKMQcLZZuG2zIcp36EO0vMxwCQLtMqFONUZJ0h4cD+kivIWKv4w1OYYOSOKizyothvhUEEEDOnU8Q+2a0Xk5IhWRD7vIxEXP73KeV5S9JwToWiTBECBWE+0FYPQlqhax4FZaEEQ1EWQhCwIBKwkpbiAawChCE1lzRcHTIDxNHQ6yWYaRGXEg6RLRmaD1Iser5ZTbLUFmuCYlO8hUAAAE0dKRkRbAUhGKZMaAFplAnlBZMEAEzCEyoODDIXHhQRCccBceAofaS4SgC0B0EF0ZbHmfqXNllaejPiABhXFwOYW9CxtBXkUOgZAVDhRhRgHJ4hiheMiEoE3nj92nK//uSZOWG478v05tPNSA3AwpTPeYeD0krUO08a9kBDmhBh6SY1o3IqfLpVQoMV+4Nypow0XLZCONuhwJLbjzSUePt+Nzw46DQpiMjHdLihFot0czunbdFvl90dydPxN0amiAVD+QAATkgkPlKDDEkE2UwklKoZRjUpLOHRzZ13fG1VAUInMXRZS0+B/v94en//s4JSU9qznBagY1TliOlRz3anf//6CXMSGhVIPYTL0gVlAgUtekiDCowHHh4KXSlTBTMM5DiAkWmRdywK+pzDFiGgSijHRUJ0vQ60wxK9bfsp+J+ESMYKXkibeQNuCnUjiZMNjh4xDxMLg3YOzw7PPPGKc5ADihxYvkYdyPsmyDC7dVlIHczxVwjj3uRnDvF2/PBFRIuMnmPLYXirNjlz9J9zuJd7gXasPDJyPGSACtGEmMHSuOKC2J3LiyoTvoO1gxdFMG48nBuiCM9kAzxPecO+JxMXsFEH/R2f/v//+4AAAl0cNBcAcAcFapoiI9lWuMghEOAhsxYQxwdvoDgRMOiiyFkOQ9KG/UZmItKlrvjlP/7kmTvjsUSUlAbjy1QQMVacz2DHJMFZUxtPQ3Ix4uqSMGJ0uK/g6NhBRfSN7B3CoIU4826KPaAgONojunMNf3WpIjckyyVzZ7rVqaBKKUHgmhmSFxdTn8VbliOYzJRV9hedkBfCr9dlYbBBitsDW5PusiDQCme6iJg9jikDyexjRbX/7fZIflBq859Ka5mvfW5u7uDjLO2Tk+VA5EAUAAMgIFSAUrsVyQGwFfkw2wS2Q4xWAdlaUbfJhxA582NTP+NHe+j9K9vVsAgBclCBg8FCRiSFKLF4EakX/QcIigCjZroqOVTvE79mzQl1E8LLSqzoy2HZI379UAyAJiEpgaYnGx7nnUcVgIkOfSPVbcVxgKCF8yyCEGVz+JAW3KeKvQA1jwfRniui0ZG507AeCte7IMYpzHm/hYU4qR59xMQVI4VZFsd3yki44PmTI80RRU0EDobI0wExMoJL6wIAsAoAVw86ZcLESs8kt3z/JqRQBS6FtKoJiq9XmFQyREAVcZeVN+Ud6//v/1Z3//qAYBAAALUaQxZIYz4U4Ax0UX0WdT/+5Jk2AYFWFzTm0w3ECyC+v0kIlgSaQNVLT0aQMUMLChjphhWHQQMYr2BmmsFwgCkhuW0hYGbZ3JTSsIdWhicXrS0RAkSKpF/SO3GJRL6ttkpyIos8lsq+rS4MwmkOC+HzzpcJTfzxULA6J9TDEn2eQ6oHBWb8JJ+qaJDzWJZcpPtKxI7ftZfirfWcybUAYYT7K41HvqR1MEykataPcg+neoWGwUU6AAQbxNltRL94OCbAoDCbH8z+3YIDeIaGGIy6kBN+sHJbzwif4f9Qb/8o7/y3//kCBECUSESUk4o4IFyJQQDnlCIDcU3mrRZebXc4qa+pUGbx1PBpQoEecs0JgPsW2WRNVMdbNAYHDKncwH4W2J4TLatpC86IEYka/1ibe6AaGzyYl00IBPHzWelCYKZ/yroQD1lSl8hV9adDR6b/Uq36ExEdVumr3Hz7t1FkmpIASigoal4ABplHPHOLYxu4tQDEVr0HhWGWKcoRPLZralBW38dZEf/OpYwzpiYJiT/x0uyAACyEsMPTx0XMMhDKm0ysNUXS3BoK2ZQQxYl//uSZMkABJ9XVUspLyIyYxsaJEegj6FfY6w9TdjNl+z0FhzQLfwA6ivH5XeCgVtWGrOLBFA7uqUWYysyncb6aSmBmwCFYkuJ4du1AlKyKFCpQCraIRJ+pJVgefdIOD7KHKFv9ZqZ07z3cKShSnc3H0jX7u3cMdTQ0G1JfPr7SQqsxy1ZQIWWIeUpz87N/oGDO/629KOAgIq0VFgrkuBngBMDkAEJiADU0yST6cqFmgdRbZ1tpRgvrYtSKVvxM4noutEG7f2lH/6nsiDp28W/4lClo6OMIXA18C2AAKGhYQLcUaKKQVISnE6mWv6mDSqKBx5iTl0gyQLLxLK0OB4e/NZONhDYVxuLiVnb0YxqWAJ8PtWpyM4xViCnlMt6PqeatIT3xZDoRRWqFgiVq2Gkjoh5a7ZxVar+gzdZA/piYZK5+JTcol6SWuYWZiCY4moa8e/BELOvOW+7foaAKgAyAgkCVMMZRtrMW81mA0WZYadRXm9CLOk5DYG3w4QM0plCSvv1cvEjDDfPdiUTfZ/rRRAAAEybJ3AIA6UysMXlB0SlCf/7kmTMjgSxStITaReAMWSq3S3nYBFVLUxtPRTI0gvqMPOmSKa7h4BkoVHTaQHzal16LFAkGvhTrmLdRe/OptS+HJugvx9mDXll2b7/TEGRClkD/rmln3cZZT00aU1qGvqKyOOn0aAVqb5LN2pvxdmk4K+ouv+u3B4MC6DLVSLoVeqvex2tF5VVFm5MxLn5GG661gab9rE7umZ8tLizgcS1ohZE5OfUBtMMk7YBiPEthFtgO1XORnXz4TqFLy0OsEiWbTE/kOIxS6uTbQXc1MMJrR/oAgAAADtSmLKGlFA2yNcwgYoKpqIwo0TBoRjgaQJYyg+8oEizsSZclwA4nSzK4qXmDhZn783mQnKeY4LMhJ3MLEWELY+qbgZaaRhLJAei8vDBZSHQGBGyRR5a4+RCfcSpc1N3d/wUd9wvV8//GVUpda5jfEfd2MmVaD67Ycko+S0jvJ0sQgDMJGOhRoc0Uqa6dC9pJAba0SXFEqLWkyClMxndHcxukdi84K2//Uv491DkE526f/1JAAABcJQQhWDUYqdTfMEei5kHhQeCmw7/+5JkyASkcVdTuykesjPjGkA9iVgQhSdPTT0LyMuO6Zj0oWgGMEqZSRI1zoIvSjFjPw704dTKk3peWdRsr0vbCSsBNPcWbcQp2VjnVjGI8Ks2nU8JCojdAqEiINh1XTuIJTcCeSGo0qkalieoN1LI/sUlng+4XJgsxJpYLWUnVnKFpMlag6PPpPw0+QohECJesCmKpIvEgplpHg4i3VRammgMo2LTXmM4rFpjSuXSW1abg2ASY6vvmvXrx2+8v/7yIPtOOzg1UjGsMNl2g4UGpiKBlC5woSMGgUaFvpDDDGgxRZC7XEfdkjTmS2n3bLQMyilZpTKnlZO159IjJICgSKOSvCm3RUEZ79AA1xHgvUIxPF7ghVpZELsSRnzMI0Wf0lkdydKcMlK0nNNGrPra9wj4wqVGn49fFGiRBZj1PUY3ICYErehgdxq3hN8j1QjnhbqIph75qGYQnCwsMuFwGmpA9NaGQLhlR1ylGmfTVR/70gAAC5GlgwsMAOAZPAcnMXEwMPGEA5iI2ZYDoPGPBYjHUaEzGHSpFUaE3KbmgClS//uSZMqOpAwxUptPS2Ay48pRPStakCz7SEykWoDAjCmY8yFSBr7Nga6wR+2CoAljuo6Khzi6c5wnJiF+7K4hKS1/Lc5Ble/t9F7Ng6WbV2Cz1IIBWv+zrtrUtbDxrfCtXD5ze38UlLyvK7XLTG+q50aJgvkd0/oKFHWu1WKBWNaaHLf+1gEAmBUyryIMmYoVBw1B6IIuYQ+0cEx2LlqnnHDttKGt3FCmgNtT9/u0/R2f/////SCpHZBpcaMLhSMMdRgAImJgAMOBIHCFwUCiUUBQCEIK54PcULASmD2MvTlfGBom5SthiYA86qbsuE+lMwdczGJYxCT2IMW8+MwlW1aApXTW6OQ5R4bLAsEi011VRDC9WMH46IV4eDrWATDmVt1gRKfVaDPRM8s4ZdoZnkfnZ/8/Ykyn92sUm8GtglDzr4BAAgKotjDXSkKQsl5CDFFnH8oOxWDPoWET1FzCkcOIrqAkqCK0ziW8oxRGh+/lvZN/6gAAS6IYBDAGEG3O8pMZKKyZh0hqhAYeQ4L0CBgcIWSi67BEBRZZ/bZs2F5Guv/7kmTWjsSAPlGbbDaSMGMKcyTDTBG9O0RtpHpAxwvoyPekWrsXcPIWB0yC8foobQxf9u85TMmbBB9LI4NWY3q9PlHJ+lxhommcAEfVN48jjCagJMInDj9ppOZe5u2o7s0lDbNZVymMlhd2+10Mdig0jIx2TedJWR9lwskV5rvaNAAAmgYU7kJyq5JkuyrOg/BKco9+2rZ5KMqfDdy09ooAikI8H1VnCVs6LsvRqNM8Yz/d/xOQIACElJwSEiAOQxQE5FgSJjhruLpod0bhDCanSiFIbZlp45EHOOhzHouEGVy0+cH+CqK5peNcNnjx3j042xTsWb13O+xHmWy1oxS3YrbpkO/S8ghZpwhkKd/RneI10EWgptqGx2h3absnzT02u///rb/GN/9boLaOOOruwIFmWzWHBIAFPcS6dnpR5oHa3OiOo2ERtZFsqpq+5+qJmrckSOSzIQhi6I0rQr3+rs/X/1q///7aAAG4bMKnMUDMJ9DvRmxIWGiIGGCQwMGIkmQIODgDAmnQQ/kAJ5qhlK+E5ZUmEpYKgXcd+kUYhNL/+5Jk1YhET0tRG0kWojUjGkM9hlaQJStO7TzL2MmL6ZzBJYCw5+oYdGH5W3GKQIyuOLzEAWH3olDayCTUzcB/sVml4dgBvsHfr6NHDxXHoDhETma2G/k9+A0XokcsRzFUzjXrzxSadlM2st2X+ksPGawoDRc8tsyKH0Xr6NJlkUNgt6pXIMlxlR2o95IHA0G2HZg8GhhZgP1QJsuIFEMIGUsnjIxe8b2hTdRyQBB0ECCK0epp8uf/zSSd///Z/6GJ4gMKPl3qOAI+OdSoRAAJJe8rIEv0BBANcBpzLlY8vga4l0yJqM6gvapWU6O2j7BjkYiKlkSsFWF0MhcikKB6yQRC1t9hhfrAj5KicnGim9pw3s8RnUJ1oSTJAoQ2RdKR6/Up0qwhRtaXDBK/1NDQA5EjNQJ6j0d7pOYTjuViXyy8Izn7xQkhU7Ea1t450/yDdlOUfHbQLASUdUpwXTFy48QgbJ05PWnLIow8ORKGcZjLujBvMIKAAtMEmCmJddtgW/tz1+i9KruNqyHc63O0VH/S6WNTbVVIPBAeGvmVf/////uSZNsABWtaUZNMRqQzYQtdBEkhlRF1VOw9L8C2EuvkVJUQohgAAAAqNjEmyigVoY+tNma+XjbMWjJBQx5oEPp2bftHq4UJfSbjSEICZbVKfj9gO4sK8hQeT0HoVQNkuaHne6XRATIKMDaBMG5Hthmdt+4JNHMPkJQwOL6NiLJMrn5rLKIlj9yinMJy5HGsSc141LgCwhPq5FXsYtOCbvc0SMm2kmfmO4J4U86q/8qbUXSZhF/YgOP7ifyaOzGir+ABNwAAAEwoDz2srIoIzIRpV74D2fMZvwLOqkqKf7LEyf6RIr/e52CyrQmMJfV6gAqn+QDFgGTAiAsR/0EFA5KWi/EiITcUx220agSCqa2zkK7Z7mqSUy+g3NUl3iH8b6obCEk0R0V9FJm+iBDCandLI41v6/myETAaNz7SijsB9A2dbF0kTFTzmH1q4dZsyN5WXvuUO56h426aUVHHVXd9cU/4uz//9xK6C53sujhf7/9FQxbRysoGUIAASmgdovVTOahDs9XSjCt7K4N9bmsoS+d1MyfthW/SWUoroZhL0P/7kmS+hgTlV9W7L0PyLqWLLSQlahEVLVxsPXMIz5ZsqDOJWOIuPHjK/29gob+mAACVFT0IMYc9gfCJgQMQgQkuMaBgYwJS12uplTupIa8NR1aDWwwjD4bX+SEXe3ODI1grZCBkqYlaw68uYfXo3pKD2xU5ia2sAS6nxt353tyVkC0WYrZps5eXFqwjg4ABexeJzzSe4jpEtLZqrHY1QrEE65TptfwUnis5X63cKIVifeDADW9AIBMHDHdVS1QRB7ETaqu5SCSQsFZYLABHTVoMSZ3xNmiJoP87b6m5ISWzmIwli6zPlxR4ManPPzHjS7/ScLBFlGT+tYAcYwLJD0DhgwAcZboXWu2PBJgJ8QAhzF5bDsus4D8PMxhlQp1b7/L2IUOJ7mymswOKhQ6oaSy1tJ5yLXtVL5TIiKEtiLPHyzzyn69upmkxAkvnd766noh5XCotXyc3YD72gcPp/sWmlpzQwiPHXNqpJhs6jVvdEHTWf9Ebp5rNFJ9Fqy2NGzt+6KeWON0AAyKAwQDnAPPuJ02IULH5rp+CuNzKw9xExBz/+5JkuY4EslHWEwsXIjPj640FbU8RwV1YbDD8SNSXrPRnlUgdLSjCdmOT4wBn/8n/qjt+FC8SHJ6Cv+laOuoHo8QQk5LZCPT5ATQEzFnAkTTLNJBahGdc8FQ8Th5qK0lD+jSUUyMk/l5VPrlKE8lnk60q+rVdKg/EK3n917iparj3Mb8DI43+1/0pW5hOleo5HbFNq6/UMHacL+lFT5lyUjCDlXhtpsFteYIsTaAgAAAUCRfesFok/tZRl8D9eVO0JYxm7F3I8ekxzqq7BNZyJ+jzwdt+r6t/8s7y3Zu/+JQAEFf3RMY0+hsSQhEZnJARg7FHVlBtO61sUvLFQ8HrmWRolsOjDg2hY1pCinYly7K5suwqqebdFPFO8krKuIfvdxFWS1quR5wwogH0Z/Jtkhw9r/6/gYbPqsSsMQczf+rZKqzfa8qwg0vE3rXJIpZX+kqsjB0Om4TauQ0DKfd6J2tU0awrQ03IW1f4ULLtSTnOQLXsURmo/U57BSOIqdamhESf/1f/pL+rNUO//ooAAaGAR9CZkixS9MSLCHwGAmJK//uSZLGA43NLXFHrHWQzZLrnPSdmj1lHXGw9DYDMFisJhJWoJqlykfzBmDSnkc3MJhtZ7mzI5tiY+jMPDwupYnLXlJRKFrxsmtzUvgB329p59zpa4MXqyJX/G4r8Zc2Bf2cuGlDAuaSlvqIvO6ElB8PsaupTJqHyVVQvVXEJvOc/gar/xROqP2KTeWWcMvp+xAGzfZ8gmEp6aAAwJS+BhoWoE6XRT3RpSjnBoTRmsWV+JGhxBK1+WPLC3MNFQlONcMVRQwWGf/U/99B/RV/+hS7DIhlvgBs4wBQFrghCbGmoXTcAqCk2r4UqnNSZl8UhigfCYbVPuBY2VQXNgGnqS6rB91PRbQcI7MrPiFw+u2vz3RinBipRaWEBIeqGrKKCynil326C6M8axWYRMdnoi2KZRoGGLRrLmYRdFZ2UiFsLpX2J9lhfw/GYhgAwhLgKazR6sKfQl+nBcY9S/s6W1Cy4BpvLjdb3aEjPuXKv60sY241LepHyH/6aABJTkYWPjQUBRS841RFCGZQu4LkWQBrZWZAUUTdFZ2hJObEV0zORl//7kmTIjqRGUdSTSB6kNcS6kj2FZg9JLVhssLSIvwxqnPSZkvqKyYYDzXzEg1wxx/ihFKoITmNztu3cDRQ3c30qxYcI0S6PVI0LA53vb5jg3vSx/zctxx31BIgqK8OM+b2mH56+Rk0WU2PcDRfKyD8FfSABgQjqCRbPtCmdlO840eewdaFToWKv5ZX0oXn7jHpwr/yFYjxKsvcDVktTkbDV31f/WAyEABSctsdBRFRJvwyytY7TX4VhV+zJl2/keMVgOCIBllyfbBLp4Gs6D+ckeGjlwp2kVtlol42S7azgyqy43tPbQFGPmvkeNHqvXfU2ndMCsD1IIvrKxqNE2+mmSKXY4moSdxDFmkzW/iPG7FvOiYNqj6kYMIHaLYZR0mDlfPJWC6gBRul1lhz1zaVUTCPZeU7LFMxy+TqtcjrsYhI7mdUXzsuo9jav/roAAAqUqBCUYagWYH4FG4+nM6RIiMNstC4QyJlN575awVx1K2jU8PwpQxj7vRVXEtgVxk9h0G70aa7Bj5n+dUYp1wXBbRiNG0SQqS0QuM539tZxmAn/+5Jk0wDjs01Wmw9CdjJDGoI9iGQOeS9lTBkTkNSM6YD2GWDDwfVfQSILRBHUCJK6wpU0cgpNm1zxtDpfb0vC1JuukV3UdGdzbUxygWJGholjI5ieOAiYZKCBItLEhJnp5VGESQuYrEZY9HAuB5yw536wcyeFmApM49DDfCScIiSknSUomfCmgsZz7CgEfj/93rC9KQ+a8mSGqXmaUmoSGSPoyjQpdxcEzikMkxlWcVEPSkc3Ni7QEH2bJZJPxEmCsMYCte8jwsSKq7vLyV9AjcZW/jH5BECwHxXAKVqaWXudpDTmgmIrVoYndlyYltv37udjKPqP9jnYzM7OOhezva4JksfV7XPJmpVRBR2FkgE5QMaKhHxqmHrBBihHwXZbEiJkhw9aUwGkmi0KKCiiMsmI4CFR4lU4y84KHLQIiD9Jsj5ppCoNresDqc87SqpK39EAAcCwAKgzWrT4wzChT3LTFhS8xkRTRzEijTzgQnSAY2EIUVFZHKay8q9S+osmMQMTdRKXQv5GpyAgOgbBMFMNWXFHmbkrc/iKcueh2FVX//uSZOkO5C4/U5tPRaA8wxpRYeYsEKUVSk0wWMDtDKkA8yVQ5UcbeEzzbVsFlgyxgGTwNJGhuReoY3wXDh47txnabTo24qGYgp/wTf8a283+jjR3r5b0WGW3H17Y8gKKYIVG4TaAABQLBgIaXcnhHF4PRWIWS5Dj7S+xJxOvI0XFQHukmuTSafsnnB2drM78vIOHaOISyFcjTIJD3yv/////6SpgSgBIINPDdGTZrgeXEB4wqoqGkbAADBA8vQuWPFvRaoSxIB4K5fHGErG6SY1VCXBFEwjHof54D3MRn2jVogy3ASpe9Ig2W5604i7eX6AY5mbdfXYoVT//o5qDMfiNPc9nZjN+ct/n+sjLppIXKmF1ngrrTDzzK5EdFhTR0BsDsJ4dpGTkgXjA6UMVKcnpuYnnratLnImf4OwT+2qYnoUMAzwl88/JyXe5f+gAAFzVshb0fONUwPDPVYSdEQIUSWajskoKkw3Tp1StrBMFEWBWGVtsIjXLV6PHwjVGPF6kWtXI0eKIX10pFcpVoU+qCrGsGPGW6chxTFg6PE5/BP/7kGTmjvSBPlGTSTaQPeMqYynpCA+A405tPM2AwAvpwPYMuAvupJwg1o85xRlIcQrTLLpsQJvYbI7juSu6Rl07XXu/4vh64br/iqNWLdKd5aEIqdLjwIrOmMjW25DrxCVyhdTO2NrHlkvBJoO1xEJCWMWhetsFMCyTYkerpY5M4rNSI8IX+P/bsogIy7wJUVyjvv20Fz9bBsBl7wJwvkzA2dggdAVAMSFgkcn7j0V8gj/VxnqlIyB8XbjrimqexelDOyUlQC06OdojR2VlAaFAtrMYTlks8DHBC2ChhRWyWWsWIqZGoSQKTqmrWLvr1UUisZqEekjN9On/KjzkdTHRVWDRIYUOBBlPF4BhtTYk6lwjEJ4HIuRUTvsrIli8uP46wsj+8FHTOnfGBHjIOT1nT3LX7/qjdEj3fs+lAgAACrsIwRCHN+OMdeDMDL2HmMNGDDOjAKmzotKiKETktabI/shjvIJQ5y52pO/yvJUzzClVVeReN6KPG3CXSmIyhogWE0yj7TXWW2uDHEhxGDegHGPUcr0ggSKG4+Vh6RKIFP/7kmToDsQqUdObL0SwPuO6QWGGZA5BRVRsvE2A1pMphPYM+GUNeFxBSlN6RJll9LO+yj5ZZr6Bw2C7bObsUHXI7TQGLPa7/QAAKAOdI/gGE8jFSxZOoxyn4BZrdU9Olx4zUNmS0+MDsamI1z7D+HqM0ZX051o4T67G5v8zg2Wh7zIdjT282l9fbJBAAElyJvgEwogNuA4IBGYjYAYhYBCp6CAcVKd16yGtZWFzSyIQmBADUH8nVLOoUy3M8dxxOOhihzZXSufJsK5rcUlGuqdwE30+2M/a09JmCGBxK/azAiFoRTUgddsu/XrU9/jXzMx++fc/3Ncmm8ZjdvTxMtpW/dL8++YXrIKP17QV4x4AwTXAWGAFiVlxMqpSQXZLDmOZNCXYFIv9S7Vsdy+ZlNeJZ2KD0vFNJpNMGRYwvLeaWcZhMRSUOVGDSbLjlavQAAASlSNAZQABBCbNgMCM4KQiqdAQY4ElOKEFPNMamLepgz1hxRKpLcuA1R2HSTtDz9OwV9pRhA1tmGndUE7azfqyjLLy9UVXONHQ6d9drcHFxb3/+5Jk8QRkQFDTu0gekkKjukM9gnoQ9UlU7LzNmPKM6aj2GZh23VeRJsrMTNFmPvukq/bY3427d622uO2bK7fmSOWkNOJPLI5DQsIHmxGpQ3pLigAGBKxD4FcPA1UZldTuwzhYa6SiyrPvfLScwKUKShIodZxtC2VE9JOabfRebSrfp4C4vSVKsN4q3eu5CAVsh2SePaZBttDEfThiIWIGBIiMmWmV8WzksPrQYQzaJSqaiTGmwpavbSz8KpGFo0Q/LEXHgoAORitRp7GclNfoxEhbAepTqBelPVUnC/XIHoETk6xS0UuZG8pCOqKxm1xMUzZG+qtv/Bttn+h2+MQEcgchHc2HUIaV2w6Q4Ac0B9nWSg7VuC+HTFFPAScOMl5pDLZWMSQSDExREiRWJameySNaSvZFJOOXqgOjEaRc2Mf39Dh2igAAAjWFAb2dCAYXeBxZsWgFAogEj8tWLJAUkBoosqjmzuLtFV/AzOmKohIcmYF5joVxbQ9BJSGkgazKHAeAM8/jnMY5Xr5QmaTxKGaPGAoX8V+qMTiF9IFdFJeO//uSZOiOpBE41BtPM3A741piPYlWD4U9UG0wVsDpjOmc9hlQVsECNbdl0k/BY6tMLLksuVbqzl/nbzVuCYHnXvXWGWMCSSDCwTQCvHcWQhSE44goAACgCQ3yAEHUp8blPYfhzm4biIkZL6QvGDsIPAMMHJoT0tDTyQq5rGW5HXHJrDvVHF+Ne6C5QAJEpG/8kzZ+sFTOybamb80Bmp11JyhgkdHCIsAKBpWUJoRrjYiEOGiomjG4ZfJI1DRDgHRRXS5gSBHVa8zF35Z0YWz9Sgwijktdxx3nl8ggBH2jo5RYtU1Nw5BcfjhKhLP8VVFkacnq7WX2oJs4lULgK1KmCU6yYTkxOcfPpa2R1AyZHm7xwel0gUQsKFFebW8KHWiqiuJRKFCgN5wqNg3Hi7hVgLKmx3RTBJSHTGuxaKCkpx8ENlT8kJemLDa2SPVt6v7P///rAAAKkC4YaYsnuDJC1G3k4INzLD5cQGFQEOGBC4UEQhyZuqRYj3rEaECANBiCWFLAgALZ7GF7OVIV6xRalZ8W7qmWvFmEP/Oz03fehtH7rv/7kmTtDuReMtIbT2SwP8NKQz2JZBBwrUhtYS2A8AzpDYekYNRrx+zMU8aOi0NWXOMYlLET8Rc5Bm5fMiykXrNm+Dszx8X5GUzVZ1+pWg2RKO/rs/8EiVu9bYqvxlnb0AgAEFCCWYzzLnW5WTpOAMBXUlXbKjYb6SdiMd+/DGCKK1NhY6uA1ujtHRcs9+CWRJf92z+1f///xxsFwEgAzPQ7G4w8Iw481A47BQAijSERZia8MDC4GOlpVoJuiAFAZDgy0ELkY6gA7BK3TitlUcKqcChJ+caGHMtNpejdTK3cdgduWQ57IxzeTOMCGqLsdlqDaFumHGY1Hym0t121EHjNXWy73pdyBwDLP67kWZUE1MGi9z8z+yri/2TG+cBcyjgYAEFABU3xNhJDK6FqFhZmVFIXbMWPAY5H1T8FqMMvgcoYa8EMAOLOWVQnIR1c1v1//6oAAAFRnhKFEsiIxgximNqKgUKGMBYiJAxZDhQwlUMfBwUBJ0g5GcFUjSV0iETSJQIq8Yss0t8jfH2tiICXCWfVI2ebUXDBdsDeSRgDhPv/+5Jk5o6EVUpRm2kWojpj6mc8YpaQ1MlGbTzPiMyJqejxhkhInaTJiURaREnUwmdueZLkjYxElIx8F3t3CaFgBJC6bp0YpJlmySOs2nuO2JO+yuQhXl8ipyrnut6uf+dM2hO922Mpen5oXCf1vmoagABEYQyrJKDaY0BFViKJtHeGZXKrCAfZxsosMKSNnNr24s9a+lGELVB6UYixKg/s+u3/R////+KkABUu/eAxHEWRB6CQyIMrRawgGgV0UnWcS6zAlFQxt+Z2RQH70xGM8gumgIWDwLhpiYcYPU2sk44SvvconK0QHfBms1iWGh5RotLUR5HoZRS+ZrUKTcee9ca3dpdOrKlFN3Tgnv3SazSn1ur4IhMfQ5bGN5gAeRkMJkJVrY1sBjgyB5oTAgg4+MARDKUg756PjVwUUWyu1fR9FP/0bv///YoAAAFURDgAoj7UMxKjBq8Y6Mm3kRhoCwUSFjAQkwokaGOATtg0PaU1tGZn7BmZqJioCnsho9LNUdR4QgkME1xPXA0+lUAAZki5mwLJVtVqn6FVshjMg5ah//uSZOYI5NFX0JtpHqA4QrpTPSNoDjFFVuygVYDAi6nI8wkq/lOx2o+8W0xtglGpi8tifiifWH63CoZYb1cyV9oNhZt/Vdx7HKe/Milde7QRER1S/opfa7IOMmojAKPGGA0AAAhQuQdh+B3mkLsTN6y3ah8BvTKpqgIp++XjQCC4Ot2vA8MqdNXnBWrClu85nhHJaoUr2+U/0I/////yYWBYXGMgIcfDZkIaGXBOY+EQCDYVGZhsBmBAAFSgayHZUS+DcZrLooVoNKOp1PWoEkLAylLaxRacUKCyuIKbyCUtrCYkqN62uUD9piGeDAe2nR0VNQuwvJVlV92Tifa7rXiX2tDLV1sNXcmKzv2oxpFxEJhcrHqcmweAmQM+peXQ1C5Yi4CoAALbFu3+AJRGUnHSSkcItHcPI90P7ZKWKdfWwVaxW+0B/p2ROnvNuvqbQn////oGqWZBUoCaqgASnJBk4xJz/kCkgQ6BkBK6nUg4CfKaLUmiwpsro08+02rJowuFxrddm1WbtAzhVGKMcxYtrmdatsZfOppm1lM5R2qf+v/7kmTrDgSxStEbbBagPUNaMz0ihBCIv0ZOYYnA4odq6YYYYvetgg08WtTNqCcQriGpF3M1cN4pxorFAQXk1M6RcR1Bq0pG5WvyeloUy8VU8c6vWXBBTgokwJAcu6gGBadeOQlTSOa3g8ZcU+nYFFkNa4z2VrlBq19RIrdU3cd///6EVULZYoAAF38CgjltDYWw52ERjnQTjMBhmHF1OwcLWIigo0nW9zJHLUVzbC04ZELRHhELczGJUHQOVrTbMXKOSMRlGN8A8bsrUr1MpDBUrGtQp7I4L05hw+tF5pwQhiZoNykrN0Chwhcuk0a9YC20lLbcun/638Tp6DZStdV94m0LgudpDH3NMAwQBhIqyk4o8otPrbLKiTYdUAAA5B1MXFRp8uZFFzfKZZOoNCdQfjz+7FQTMNMjdGiE8wAOUoKbF6P8x/99qbvXIdPJdMW3EybqAAHAoTmjGRqoyI6sWbgCKmg2bwBXmOKtFDkxUdnLSWWJvNjLXP9MoTlgmtKZMdlBQanIyRRJCiJLeJKbAw0e0lCdBPyZniayYIwzwjj/+5Jk4YzDrEpUmywdNDLCaqMxAlaSrU1GbTzSyN+IKYz0jVoWmaZ4n4DWpWa6oYGfNVZEU7u2sR5Y+MzupPI8hRIGK4fUFmNpqR/Ldd2f0HyMefs/84FvibEYcd0IZeuACilWwSkg4JnadyhrC6hlzYsThFTByAWdFhQBa3WObT08yrbaBgfoR//+tvVf+sQHd4SYOAUZIAG7KJ25mZ1Im/jhlBYYwOBxwWdDB4eCTPDAw8GV45DKiIFSLR8XNg1lPRbiT7kpHpGJUsrAgkmI+CjkmlrWG9wnnehlPZNRkgiAAcCp0OsDgxXkoblOpr4qJhcEAGA4oRMRKyGevEysTSPm4SsoRskbGrMfbBxpxmnx4Khze8YB1tRUZ2xnnSepgWUznWjT7J5hRtvjD4XcC7r/49FrRLxw6svwQASQIARTlEBZo6q2QAGBCQErONA0Zbn7RlplZBr0tsJ0GX4IBlxc/H/ccLO3Zf2fyu3V/7rNdQAB9XRtQzAzENjUhDPQQM9DiQECuQmePKkQX3lyE9yYZX+GA4DUVedtE9F1EAGI//uSZOWOBEktURN5eXI0ods9FelxlP1DRG2w2kjXB+toFJgap+svpQ4GqJHGFwzDTxM+dh/Iqzd/7TfKISm22BqMdjT9QPEmNKm1x8QruSbXERIjEbJskFelhwmm9QgV/l8y8nb72whl6mclNFzpY7Lok5Xp17JorKLtu7BmvO6R8AAACneIQHbRppNA4o0yqznGs1jCLtCzHC5oHVuApQyFSTuxvRV1xN3TKv/y3//O7JWMBkw6idvAqSIagswekpMmDmBhYxiWZETBcpcMqSGZNGUNJEi0NUk5MmAlaRThasgXxmmiAul/ejXPNHolvRKOaFaQ+JOdSreqx8rppNIWmVREu1I4WNvy0GCJqRRaW7KWZfj52h8ZShCT+Qj+6V/7LTTeafKNYrq/wX9tGmubu7/3ocAAYAAAUAHU0V0c5QUT6jwzw1S+axoFhOKbzZ8F27PGhk8VD0p7OOLGWgkv+eb87pr9CQAA5dxQ4IEHyANBpoGQwwtuWXeh1S7QQ1sRhdVwy1JqwNimFEpVOO1yPrEYqDhcFMlnFQtjaqnJH//7kmTWjgRjUFMTSRagMqHaxxUoBJBMy1BsvS9IyonqaPSZyEU4Pgh0p1jitsSSZFq9z1S8UfqzTwjhyraV6tNUs8jBQzSoeWGNLigirbLUqmWLIiUD0tt7UAABJuDAwoAXMDUEwBYCxEK0K6CWjxkNZVArwyy3Yb19NMqW/KYmzGH3yteDw6rEip0mnCVVGfqU4hhB0pzmN+JHMa1nnWliKf7ieEsHRX6pe2zAVaoUM0qHqGS4oIjayUtSpZliyJID0t+dJBTgqACUpjxGaaY2AQYKGoighNLhV4sajxjq8A+J+n0ON9UxleDqMphEFFuRZsD1NhJUe3IowhhPJ2Js6eYHZisMVdoHGLT5sKXCDmeOkFGG47XmynDI1DOVliqAHa1JVih5YCMDqHP8ablgoZVO06w7gSACUpkvGq6ZWBeAw1QMCMRomJJC2CsbN0zi3TP9K4y1eTpDwOR/G6FGQpInsY0IfqON5TJAYUKfDBBQ55OTVhgrtNYw+3HxwpBBRtRyQU4bYzWTZTh5qxf/+xXUr97kepdjLihaHBWLhnz/+5JE247jdzLUGw9C4GwF+pNhiKKN/LNIbLxrwc+faQ2Xjen/7K/5FHc4qgAAAYAuODn4dHqmYREhpghkoyMTDAwmcjKSMMeFEBEUyuIjLJMwhdB3OrnC4acwhIR7R4KhMLTgTXC849WDkFrF9AQfC1zqYiSy0zCJd2GUE65mvM5YfEHQaQ6Shbv07kVokY4DjxgQnAvKOOpZGA2MtBdLOFhfDlrHscUJ3W0viIG2swMnuYrj5+65Xjn/6v/+f9Lr+lmu4GKO4e7saICJABTTTgYMe41lloJ7VaiFkhwuw/GXK1V3HUyDQuKTZK56m3X9XQlFuX7p7+385VtPKUEqgAolJxMgrwOg3B8HigR3lqZCpNEU6dsLE0q1ZcGFjUrY5Nh+5do2cUFUSx52NhNPeT2ENkyAhOPvmDcWdNHKrudDxruR7765jqhTEVxBGPWdRGzl50dRfXPO7L1FBMNIRzlM8hCDReJw8s50jAJKABOS0KUNwCKRURsnLrToEjfcGpKxhraQley0GBVD+m/0y2pn/pp/q9RT00L+q2x6KgAA//uSZLsABO1Pz5uZQvI0IPsNCeYDjdVDY0eYszjLhqrpBiRaAnlWHuamMIEO0AGjmPgMVNg3MXJEghlwINOGAI2WXolS93WprsXitEvumq0hw1b4ALoNgXSODE6HtHhEFPUHettE6pOc5SjZheMJfjqZGxmaVbZgiKhzg4ZJHsXFAgoG7ZMK3DrqAhxJEPJT2JCbBQgTXB6Sm9k9pPy6+RZNyOnPvTp59OkZprHi1QAAIyACWnZb1EwdI08KSxUZHw6FjBlVBtvFA8eQTs5izzZRRtCH//f/oY2mz/+hPq9akAAly7kpBgJI5go0w8AdSlsIEBVADCp1AYkQIviRG2e8BRXYpzPbFUtuLIgVyI+PM7jHOdvTBvROxOT6NKUFEyOK8tBtZPqd8b4V/PY6O078NYEQzaUd5bSvElx/eTT4EnX+AcLMS6qhd3rw8FAqJMP1a5P1P2gAAquDDgvlAGdS6SiENBLB4Y5gJREg6lso2tHgsPMiZgXWmTZVt/o9qm/+r5pP//+tqgAAAnBkMNlCjOLg0ciMuSjUEcYPwIPAIf/7kmTACIRoMtEbTx2iMkFa3SXpUI7EyVDsvMuIyoZqHMWlQmMpECqIBDwWgBQG7bPUiGJpVKchwUuxeKcETWTAa8QuAI1CwAYGDMSc5ymRt1aSsySxh3PlcRWuOkdhkVKXEvH3Fxedl3IGI+vuW4/X7ab9OEQcBHJh+RKsPlzM4U0afw8s4QtJIKKDo6mpCyYVYwWu/GgSBKTt1jIhx5nVjplCYCQlketyoEYhQkkjhaPUY0Z2vr9VlHf/6QVM///kYcvBMFwKSTlsfQChVYgAGmYOtFQ9aLPlwZCMieLAdLfQSwjabAjAkgmIIHQyBoHMYkRlY0KmiqKRTndSliBt9c236D5COJzEGPmRLY3iX+9u7+3/2O/u7umZohpJvqc7/GKKGYZeECBhCTBMGnGGp/MuGl6+YCHh4BmKAIEARzBiKw9GpBAVEcsWBBAmERaxhxz0RP//3drf//Wja////4vCiwck6gAAcVAzeoQ0icMWATJCA5kQBpIYSKAUkTECA5EIePHQR0AwWje7LdJAlS15QdRGWSawuR5i+EXXctf/+5JkywAEVT3RG2weIC7hiscFJQqOnTNc7DDI2LOqK6igC9ZUldaj0MSYlMMcYs7LK41DTIX+mIzTvFDScEl5nB06yKWu9ahcAWJdiUthmaOLhpJ6kdz20FnoMYW58/6Tu6eQRyNiiFooVFFRMlLwSxT2iOCPPDoe81GFi2VP/7tTbIuOeQQ0gEAAWYw5YLFUQlBw4TpGQ+EmiR/ndOIp4e+MnhTGb8+EgM8Tds3sbDQ9Tv9LpL/////yIIVTdNpKAUgaCnQEhH8GJn7RzTzdZb7LWItVMUGUdtqlwVzwyVYJ0YMiUPSEJmMXv3z40FQSs20MRaXMZWFhLSOhqy8njKRVR4LNI+ethjLlgXF88/NQL0eLl6ZESPEPF0MFLsXh5GjoRLHC8tn3MzNbtbxERpqJB3/wMSuvJFK/4CUpjtlkeQBAs1IASYhALLe6JCPqjQ4Vtt4mhrp8SEQgD6elbJLCQwWNBISFSThO8JJLhdj0KkB3q9cAACZ+bQ6ACpZgNUAlOFzBsjwsAWoraVTJIFTPT3BReGlvLVZRATXXnQsR//uSZNwOlPFXURNsHxAzQrp3JMNYEckpSG09D8i1COng9IyyMgh4IEL/sqUiWvUuZqzN9S7DE2WphtXmry5+RhOtBdl76UDuv3L1N41DsTi2qR4E45nCS0gjg4AGoij0gCg0LrJuyqbgYKrznFznSute4zjECyFoMDfkhGFH6ZPgldizlOsI/+svnnQqV3WPRlnjgIiAAEUAS7CoIEUl0DotIozmT/umyCJKTw8kfiMfJscDnRGM/dWjepX/y///////lIQW+mmSCCLoWBAwalDioVAp2WCwa4UR3edEyBoYtOlTw84z1s1krm0EtdmNw0NPXnlh+zAMFSqNQ60q5AVdiLBF3yJ8bUZmrj+NokAn0okTFzlkKYfKkq4pAJYosyCTlx1cSMIUz9oNGaxCp3yySHQh9L6agmH42RD8+kRr29UsmJenYa6W/PEmoT6oCiikAQUGAKXTKzRwjMxDNKp6LYpDzGuh+s81tlhQvTbm6UYBs+kx2YUf3+n6//////+6UQAC8UBmPlCyEQPTdoAdIIghi27rDgFlqi6hbwrmUf/7kmTUhgTbStITTB8UL6P6tyRldpFxW1DspHpA0Q+sNMCOCltRVlbtReIq3tmZ202TxRyHATvCgJ3muQzNxCOJHjwjB7GIs7jwhAKGEQ113Do6bBRiOmTxZ5skj+EhCWrSc8oUhc8qaEmI+KwSws5lIbp9oz362TIsm8Y7eY1vz9fgVEBhX+UzOynrPzWJLS5kfJfL837Q6gjGAAAAAFy/esAKcsSrKMcBBn6sR8kiHIRmGc+CAF8VhaYR+xvMcbOQWyCgOk6zLYPP0dn///////8OwGgAvMMN9XZ0Dup/EBhhIKNGWbDx5IRS1n40Wgd/ko6WlFgjit5PMzDBUYdheahD+piSYWPtxgCPx9nUtZyNBYzAS+nSqKHucuVwIm99iWMxZKLWziicYl9ltQTDt6FCH49O3apNZEo+bvLOKGLN1mb0+LtSiOd7LWz170M50Id9F09X5UZ7y72JdX/NY4zh3ayQIGXycF/NcD8oSfCIk2F+oCbnks8FWu20yTgdIQih1kgbFU44RAppebeza+YSRssWK3PmeAaFcaCVuLj/+5Jkzg4kmFbTk0weoD0DGso8x3iSFV9ObTBagXauaMz0ixAiJVc1WLBxXN9uSC2f3cZre1/+pf//9v//////////RygxlQAAAV0hjsuQdiNYzAIcHERacPT0hhYPXBAItCzSGysfFGVrQRHe++lSRYWav8mS0FbkZEMyddCzt6HWcVqUMoA4xAl2UtqMDAgGLQa/tNhnGpeqcMTlEdgqEbxicrSepKwbMMNUpx4INq/PpDHvmZu6CZtABFCdD6zREUaGhCdTyjMoVWlyDs7zIGG+SzBH2oAYpeFkXZNqE4VYUyOnFIVTegm0/XcE+Fpxq6xAFnf7Ttc5ooM+sy7U3CsIU3U0ila6s1P1sjXmrWCU6R/6VfWCpSwVNsaMGkLhjXYuUAQhkp5owpixaOQVJhj9SqARIo2JMlGd3lPXV5FnXKd8hAyNWhpoUClBdYCfflt2kuoKjC31uH56E08AiQ2D7cbeXdpsjXKVxA1IBCKpftRC5l0E2ZTJSVjS6EFPW8GCP/LLlU/82yOLDjaqMbPrrPIikN87hjBK9LmxsF/d//uSZK2OxGYu0ptYZLBDZIpAPY2iEaUnSG0kekjAkepMxIloy7wACdgA0ykfTQ9dC9amVmQd3Ab2zRqM8Mx68asHX53NWokfPqFMicv7ghVvDiOSu/1KAAGBgbMiNQFJAkDM3RAIBmJDBrnMIi4aAyIIMqHwoHJaqkDghbagLhF+GEQc2ImFmTSxWWDmDJvDA4HGb5PM/XW7O4vtIh0Xigl6ajPiIDmIbr6l8sdqC2n5zduZtvXLaS1Tzy0xoWteXkzmB2pSAVa7ydjl6Ztnb2cpDeqarR0TfoRFSlEed3M4mScsiv1+LIMSwWx4hxBXw9JpqN2YiPV2h4UbhKoyqUhrkL36dBlOHOGAq5pV4ZI/sjbq+ju//8iDhVBzdjcyZ6NlGgATjTcWzNVmjmkQwUqBIUhGpa4sCH+SumXOXDrK2MCIsIWBADdEVV3s4Q2IKis9jjwrli0EVVLUfWWyR9YC1HGAq9mqeQwfE4u3AFi5VVtApkbQFWxgBCy8is4HypO7ypC9pRyrM4S2FfxhCG7fh6p7EyYWLNBkiVGtlUSqpP/7kmSljuSJS9CTZhcWMQN6QT0odJHQ30BN5SvBGoxoTYeZaEgFEpU3SaOJK7TzrlQ5ShSIpRc7buDFlKqYIHptYEJVKdVqmatN1YLPNCLWDfTzISLC0Kd5PcsskKAkPoFcotCDlTnf/9P///olCAkqgAAAApqkeDAkwJAMkHgILGQgEAkE6Y0Gw6jsg6W9ZkzlTSBHCiK6rUTaK1hpzi4ymNwCWaT+ZY3RvqfEMxK4ys0LfYK5ZYqp/HX21n5MF6Wpegi0eDysNVS1HPUqqj6vd7OpLSreZNkU2ajizTW5kSzaborI89btVjhxTdIABIFlBEBseh3QwbAdJB+NJUjoHq/atWCg6zqveSSHMhoqbGNXX36Df9X/////9YnUAxxgIMAoACknKk+BhCMDKy9IFuysLZZe7MGp2pnwS/784cHQGE7R0SnE16RFwgDImKBHkaQJxo7kKyL8M5L3STVTqCsfHzizFdHjL15Th0zqqnQ4DW7oepZbq0xe9k2TqIrxVlMWWeJBZo8+TIn1XsQrABlFIAICAcIQpfRQU8pgELn/+5JkmIAD51FSu2wtoDWiCnMNhgyNqPtW7CSv0Oqq67TAinJRILvxQ/Gsj3YVTeQZv+n8VcxH////qU3OzHhL//////////6ooswmHLUAAYAkkI0iBkD1ptWJgB5v5Jk8wbSCgUu8gNNSBl7HCHk+LqDHKBEigNgjwFM/UQKwCbHCDJJUXsNsuKqHWK+QwoWlVj4KWES0Uw5GV8uHqrmjSXDMpMQCqtkS6pkVEy5Uo00mNHa70oM7KO1sK8/NjcJuBsVZUZij3jnqzviEPMDzATScCByaABCuwkaMguBfjeM9iXJ1ps8nOwpMEDOqETXK5pWoPLsEwcLh5BZmlNPZ96f9P/b///vpgAQU5LMibACEGTDvgIz1jiEuVLUsG4qCISyCuRiAdnsCEOxnPURPDWAktm1XavkN2BM6eX8qu1cd6YaJ05xuTwT3LXXbo13LUG81NbCV3hWpoRdNJpSIExiXHLwpnGWIVjTrZQ6ynLd80TqpGlMABashHEHj2OFSkhVcKSAEtolPJk9e5Vv0/4Es9b+bv+EZ3X/trUwLbELO//uSZKoIhEAx0JNPS2QzAfpTBeYKDbEFVOwwa9izBOskIzAugZUAAAqAcFjCqwzi1AqeKqhkoyHTIsdgksMKGhI0RyKpWFLGCCKDPJBS4VIrljICe2FkK5H4bCmgDTQAgePdeSVv2pGxFJ5sK1aeQRtLNe8HSKV38YpgDtCooWDoPtUGDoNFdczhHXl2V4k5HhIDFISDKBouAjJM+pST26/xKGikaGUClYWAAogAJOWjXx9hG6uzSNuIXDDAyLzcnM/+l8sFdogwQcP9/qM+v3Ime3klPd+fnrIrYj/tsQFN0OxVniMKZoAHqQM4AS0FGU8lNmqhYbznPpDlVNdgVSR1FOM32pPrDAoClkTZxv2GMsMi4ZWtXNcj042Ct5WyRNhhnY2BgxkABiUHeLJEtg4c/RD/vxHAxbAjtN1+X9kI7t/pGkjAiAjCLCFY7w8fS4zmck5AAEk4LBgmLgI8XJKJQ4BhBChI5x5YnVm5giPh4IXnUGyTX7vJoK6srUX/3f2LA/lzX0kHUAAAEtxCHPW4OgOGKxvYJiyBpAZAECoRLf/7kmS+CoQiLNCbeELwNIGqqjEsJo7Ex0ztPGvI1AYqHJMkggOpEIgtYl+yAE8kSUYHoSTGScFgOEyRPATBOEeEbMEgq5EOLwGDCDTHC5EQYsE7we4mzSI/LKK+FkRguRzm+mHppnMZppCjwbw9y2WKNmZgIhYOCbdCRGxisuhNwKaKTlB3Dz8LARFhg8KR6eNkshK2Uxhb3FlHmF7ZOLxMWUUY22vuvXk9yA5bLdH1jKQSDokrE4HywTzkrF0G5dWHSxcgrG34jBYhtJDwRLH8USc/sYNn9FgBKxABAId1idESYU8DoGId/7n/3//+n/0/////////6///+M5iwRfXaB5DiAMcYAzFlwFAMkBDL0KBBgiuIHZkulqMWLueVWEEYHS/RKcP0aYxzRRxmIaMNPleX0r2052s3Ue2D7C3giBN6PKE1Dncm1tZ12ciOMIxUIkzzHrPmMjn8SM5Wwpau3SLpR9M3LRW16bIhY4mIEhYbHh9HAh1RJTElp5CQrVds7q5RvV/T97kDD0dX4f/PN9+fpjIyUnv0mUKtYTigSn/+5Jkyw4GZlzRm09jciWre0oIAuPVAXNQbL0vwLsuLShQC8KhxiJ9ypGpEAIQD3hSiqGQzqHiipu9r6LEdKd/73///fp3/t7Me9dE2//////////qgQXVgE1AAAlScbBmlxJGJgd8UaZozIQbQsdTNEt20NB25MvcNKLkhgVwNuUjYfhMMTP3tkIvNqqmzvrOUmaX4vldr/4gaEYsDsCEjAVrkefUkQmjFqRHCDAy98vNKJFyG+dXXMEgivYmGESCfAmHnFAwGGmpCAAAt2XCZMhSC62MpCajO0EisX5uowDft23P8c/eITWU/lBp/Rq1uBPo4az1Plv/v//+gAAAJVhSWwjDf0FiO8WzIQ17KAEwtATBwzgrizSnQhRrLEUrm+qPT0ykKECkp10/0uGtiRiEmA+dNkQuDaf0pymCtaf3kvZaeHYQ17Ct3ONBdN0V0+gq3eo7CYaLWP4xnMAelUlyztR+9Re/JN1CVbW5z/4wNBcnWdJuJGbn1CsxnaYcecwAAQAAh8Vm4sKRQMWcqCMOTaKYrBOiuRkeprLWepjt//uSZKUAA4xD2NHsG3A0AyrnBSYEkKEHWmy9D8DUD+voZIoCMBVWR9e+E5I0BAVR/b/1Zb/7f//5xQAAAXomCw1YizY43bNEZEAmKUSgYZTkTdJxGeSQEMMfyIRpdRclYo0Wea2pgJEIwZLmcKqTi2iVIXY/kojlWkmtllnbxbDzb4U8WLExALGAhNmq4mhqx8r02yKNwgVq1zHHh67pxDEsA1+NNLcaU8RXXLCn8fExtxx/NnHkYGSutkPUnQdlDaREeWGjeAWqAAOIC1uiM2hmIEBuW19v7db45CJ6ijfWre3p/7/1CY9x7G9HY39CD/+r/////vNgFUcBmcADyAwpU5Zgw41L8xbRoBf1M4HDl9roZCoNKIYh6MgUWxJR9WlmULnJHZjSAgOQqarWeaNU8As5fhNIKCeRaC1tCX7NFsPSZbhNa071xoogJWP481oTtUnBeTFn27S2Ephx3dpFlFhM3/q2SK/C/5IjVPj9sorbSNIK1AnIoaSOrWDN8DFmGqwCWAAABVEt6R1HQgkpjgBpLSVBKQVC+RTONZvmUv/7kGS0DgRjRFWbL0PwMgX7Sg2FRpGM/VJtPRiAzYqrqJeYyob/bHzFc1qX1Pszva//lv/bT/////QqAAIAAEJzfM2pQscYko/IghSCLbhyKfyXbN3vha14S5ToVM0eHvqqtldu1L3jiKz1aWvSOQT1WVZczTCnpi0VDhC2iQfbOsf+2eTqQNMezVOmFhVGu+GfAGIe7pBsyaIldaXdCgy5Rdo7FjY+3VtzYqL5XlVVeV63mYg6+5U6XJKFe9/ODQAgAAAFAAa4rHFIe0pGHERYQw4jR4dCEVJtgs3An2EsuywI63rUJlaYd0d209i+6Q/8j/2IAAJTlfsO0BhkyzlES6JtC3XyFRitDUEc3o5AF/kR7QLC/PxxW37jdWK8XUy6sarh4kXONBYlyJxDdTyAJU999qaWCE90g5skADQ8pKTeQ5ETj7jiCPpm7gODxzzU3tIi11Mkawa494pXt+rSv+8iRq2/UChXdy81wc9Vf6WZFIAqSJOR/H4AxbJR+BkD6NNY/cYjMSzty1k65njyEqovBGEgBNXkqj/2DM4od//7kmSzCGQoTlXTLEYSNGP6qj0nWA/hYVbsPQmQxo+qDMOKgpd//+gAAaTFMJoKYworDpcx4eMpJRQKU+DB8WEQCYqvYm4rgs7bBTKmJQR2GML0lsBuDKYZzgoiDrMNupFqaLyufcBEF/JykRg0gdPlQSpUqS3XezxEKKvF9sgL6szt6rFlqdfD6Ovx5uX86d+b+YfVxvUyoZb1LWdB9FS9vf5FccgMKFh7zmMzQAgAAowMOZuGYpUINpXRnxJ4Jy2SUzOHF2HxFzbKGQf2uwwCjxhRLhJnFnvv6jnLv/57pgAAQpfABCKERBds8Vhoc0UAgJfCQlAbCDSHRpGoz+MEs4a9IH0gWllNTthzmlPdnaYBZwcUoTg0JtETIBeos4jfSHcVtHFoQm6hGTKSqDBW0jl/VsRUZG7GHPsJj+QXTuOnS5laiAivT5lmiI5qtYXLX/otP7NJXv5KaSKk7SYUJIj22h1mcmIhMCcESPNonkFvghBwS8Q3Z53ZGKceqCeiszULqf7ev//TAAAUvYeFwD2DNoUyFDbNGhWPQEXFEiD/+5JkvQikK0rTE2wWNDNiupc9BViPUSdU7KS2yL6L6gTzIWDtFDQPtEC1n+byeE9EVOVaHmp1a3nKXQPTKzticEOGq1rhJtbihS4cJ3hFOEevtHtdVC8tJMaC5T4QKkgLOc7E+xTug2Nj1nZHdfS9NbH/x/95j0bn9oAUkCb7874zd8/1vtaZkf+37t9bfu9qnTahYABiggAABCAYUcBDk9MnKkiXAUgqE4YCHFsTsByrgmn8yaGDPM3lPpjee34+x4Pr6fLf/1gu8QClliWYLZARM3dzXIjTSkRkJZ4TxZT0ZSGjrKaqgSl0QdlsjnONfetHgiCIAWnUFkYJU4pK81DLrvVDL9U7R4bp43MW5Xbp6ktRjilB4lKeN1B5g4RkSAcVknOAtF1dDHYhRIr7hEws1xhErx+VcYyCwfJsV7Im1O6st+9Fl5pBZ0dyyGFlhAAAJyA1egpQoEcqlIekE+IFyHtylwELR191EZR6oZABUdB00Uv17a6EWwEBtHxL/d+5AABU3SUM5jMEFMnQAVcqIwMREABTgICjIoEwhSls//uSZMqOBDxU1BsvMvA0IwqtPYNGERFbTGykukDKkqpcwwlSurC+BXIweJmp5iKUmrMfjsjCONFXzTM59MSkhp4g0Tb54B7Co+SHDy45cVr6EOcbi1kqQK4lnuID1GSbmV6Zr+Hlnil9L+ziabv+pJNnYjYciqI4TWSOXPLL0BIAwACAQVAMIQbJhun6CjBqAYezjmZHGxTAO5ufqZLBrDFiP/AsoZOn418NAV7KEyPQj/9v9Sl3R2D42RLoAhxjSB7a601CzA8iDaYRBj2LcqtRm3GeetaZuwKnWNEAqJTpw9Cc15EdpyqBSGr+EN0zBNyt/kVssRtpxhLdr8y97rJowVF1lRUf5sSazQ0ZZWd8JFN7z7djnKXj9t/3/vqv7SPuIdsROAAEBBJTmFIgWVRoI5TRkzs8MRkTjwXFjdcymaMO5qWlzh4wl9NWhHr/1OP+/L1f/Y5MP4nVAABKcUbQKOiFAJEHqBiUVRxCVDAYMEQgmAI/vxEhRLhvGulArWddj6UJ2uCgMxSHSh7KlVAYjmrB2qRIIaytBf5huhGyXv/7kmTODgPQPlObT0LgNSKqijzIUo4w5VBssNKI0okq6JCKAsRyGSok8XphRYxeKBciS2V1ctgHIVShJdggrshLhudvA4PhMWLylEUXKvvLEOJgwbyn6y7W/zS9llE77jDKRzPnnllOrA3BPuLHMvQwRL7ddci5R7kDH5dfDNDtt9+7QjmMdnLt8kzXUHcEEKHACQWAN2AatYPG5jZ+D5OmbnWjHZQM+//nPKKeMDNX//////QHytcggaCZnYPglcEkTg4PGMBTUTWMRlbBGRESRIVOzUYE/0pYNWkcIoF2Q9VbhLWiRd7HvYpEmNpx0r3uhGYA1eguBYJVKpcGIX3CsZ5vlp1AEhZtQpsV2qQe2RwBsNKC8TG4ljDp4vWgqP1aHK23zR7ap0dlmZ9ct2lJEfakdittyxA6oX5ep5PTuoQ6iaHQbaELCj7tJCh1KrepwugAm6KeW1DdDDKivPAACAAEFW/YYNSSE1gt0eZGDvWZs9tXCeQ14qtAP1xToYT1I/r//R//V/1HCuuCDqUAAAF5RIuwmsQvMPA5agQXBAj/+5Jk4g4FiVnTG09jZitDCyoYAoSUpYVQbDEawMEMq+gyjTCfie6S4SN+39fjeDbvsviDsoZWmPEicC0dC817dbUgoisVWmiCsc9nKo9XhvJAWoS7UZqWrXPsUllhCvJ+/nkxBkZpdxCNjt6B9mF61rNBjLMF4O36YgqiCA161UYob3ecyPD7Iiu2uclm2InOzO1ttRs+TLHOAwoxbCC9yAULtAA2ACCAwLlgMcIGOalVRLA/P9H9AFJg73vg3/8jf/v///9n////////////my/XIJG0DYkPHrHITzlwTpWKmurCquB4i7x9NWs1YYhF8GWA02Vue2gXVFgYNmGyLqCwcHQznadZQ4BD4zSwaqW5+VZRCRQ2FG31SVkVu/lzVimblWM0NwpXlt5h6dRBVdI5R37DAtc6q2i6XThSWHG3BtXWW8wCkq2Y3/f6xJG1SDA33ejSQ9BYP5RODXxv1/zWQplYOZ3f7OyyYi2040cDDAAA9gqLua6D44DnKnH482q9GHDZpckX1f1KkwDA8RSZR/57fm//EweyQAQACFKl//uSZMgOBI9bVZsMLxIyS8s6BeJSkxkvUCy9HIizL20ocB+iOLaOQEuAKhFhUSXrXWCjVIid8yeVMv7KYHlKUkMxhoZYCHH3B/YAhmJQFYlsdd4Koq5sZS1i161SvRlPqoSJsV7dqrvuHKRfQEa2bW8oeBYCQbB4AgjmqlIIMkFuWK/qLIv7FATWFGPz+Ufc7r/4pYN7TZrFU6kXaf4AVtANzyPqmZolvvSy3BQUKHsjAAQEAACAShRQDMlyMmHVzhjY9oG1s1DBfuhIs9VUFj1LP0xKJod/oMFvjfeSf7G/+hP////7AAAYREQNsDK5IuMSCJmIGaCpBYokEDqCuhWZI3SXs/7tvQrcXBo83RJH4dipJFDsYgCPRqHIDljYwoJhL9wygkbHUrP638NRBwVaH8fLG1Ur2ceXF3FVwEAZ6W6xysTYwBb6PA0I8lq9ez07BY+v6uKbsGa3OyvJjK8LrX9s+wwEvz8zNsVKAjXS0vFWTpKUrgzJT5ZtPaZxMcXIAFgVh9YB3AWzhicrJcS/tUWyN5/QvvuzqBqL4hcq1P/7kmTCBASXWFW7CB8wNmQLDRnnUpNxYUxNML5IxRAstBSc+DW55ygJAsJJv/Hv2fb+e+d9CgAAcsDDyOQkyAawWgD70yJkIPsRBiAxBNAKaCaNBVtswjrmuu75qwzvu6vAEAR9k8joLtZKjZuVYkgF81OlJv1H2QzUFQE+1aCn7S2FRqoFlXrNrLtrlNBK0y1avrudSV2cqz0xqIAYq02te/C+cUArYLkuNFOC3r0EgQIoodJXvcjNodnkEg8fNTU6f0fEkT/Qiq3+o4agAA2xgGMTALCTGGg6jMJlqHTFqYhzfyJZxc07KTwn2m9L9pwgSAv/1N/5RAQQF6/3f/tQAAUnJIhuIDHJeARovSnEXNbGuwmeVjAHTS9Olhb4zeeDbhlPQEW6cmN6kmu8tY58DqexXI9Y1OyKwfCKQvP/CCCC13auCBkHByDU54fkRxGMpBURukc5FzZKMhquKq+jVvWI9aVLKT4+LmaINakb7sZrVu6JXNsVm13/dzZg+OAABYEAFW+Aeg8G7WHBnp6w8ETrBSKR4hITMcUHhzYAhb3/+5JktggEuVdRk0YvgjMkuu0J6lgP+WFW7L0LkNGS6zTzFdAOu7+tm/6sS7/oIhi/Sn7P/tN1AAAT0FFQCwDExCOY6oC+QUECS8wSmELISDgBfCJNtD0gaG9jQHa3AAhHHioEh2ZcNmbJ6e/BVjTd7s5XWhIKbYUFnHUaZxGtkPlaocNstTjmJlj8oddvVbwHCaBRK9/+YQYRQT7UzukFFt5bm6t8yK5pgse5ggwRNVxfSNq4jDi7JFSwACAAAAXAkT5z1YFSolx3B4ewdcLBuLcViavNw+5U8ehutYq/rk61jYOkvWI3ZQ/P7Xf0f/EoTrX4C7pnBhATOhwA3YHFAaCVaXyDIrBhp+nVEQ3lKpi5KYAXDwTOw7tHiZh5pE3S1eqI4rroIlPro75R4S5YCdG1BVqwf7TSzTQ5HIBRZgcn6s5LMGFa9YlyxMUSkPc7/UKS+MHf/oIY97SP6qGPaPfquI29Zhz5XOaKaFm+bXNo9JKRgGVEhGyio0LmjOqZS/R3FHRuD8J9KPHy+OXhTQxwVQbbYg6Rrf5gh/Y+Zvs5//uSZLWOpBxRU5spHiA2Ivp6PSZkEHVJTG09DYDDlimY8xXYdRn1qgAAbfiEwY02JJ0AJwyQGYy0ZBtYByVUMJE1H8jUBEbDDPgNlNQAaAIY53qufJgzmpsfPsKwjTE8yuFDXa2pmXq1xjrdafxQghyYPTdqk4fBEH3pejQaQsLx//AnCEXQqr9pQYA0A0G6Ro+7wKLc1WqXVqjtOksPphMtjseOrk6RQVlZVQCAAoCBgbrTNBUHdAkMuMFjPxkgWGtXQAIbjNjSWS3b6Qf1LHGNlq8cWz1LenUBPFVkv/mQVQrWceGggjZ6ZN8mcCpcceHU7RZaAAGgOXgWurQq/nB5EClzY3ZU3EYmNC8rizl0jTqdp7l0j6w8oOx2xG1bm2jdtQSBl4GDWEbvW3o6SailuB3nqYhpoEqghvTN3tIKyh4BiqyTsSyoKE6brMJjHv7mlOb7UZFfb1ZyGG3MR9ERnH2qgAAJQCARRGA7gVJVgOW4kP+rYWQOMWsUloSvYiBb3n2HBY10qeXdMe+By/2/T/9P///8UKUAAYBi0XqGxP/7kmS9DgQhUNObT0LwNGM6VhmJCBCRS0ZtsLiA0omq9PYYOoGcSG5IGKKBDoUHL3AgYyJMQkDOFxkZBUfrqKMOZetmO3igAGCVnMUlkOyx2YZsPnViqbrj0kMw+yaNWH2jDuNXoHalLIpFvTBVpWZYFQwLutFSTJKyVAYqTQ82I6fkzikfD0t6zcYqFWXbg36dyPCCTaBcBkEy4WEDipmOilIABCFGTiFOdqSJtOR7Juh6xsuaijgeOSwwfdPwUPiMXERsXQjggg0Z1X0sv5VRfR//b///1X////////crQpWRwyAdiZOJigYVqBm5oZ8JFqwYCmMkJhwkiORi9dSxMhxcQYBsvR+WCS0QuFDAIE4ZY03jGkASrWkrXeZySAHIASItxf1bDE5FIGtKhKj0JwpyRv4Dm2OdmeZzHiFXmbF7d9aPVqLKz/T2LcKhxhciJLIOnPcXEaK1e5B9/7DosAh7pU6q9HKuY3oM1lNJsAzkEAURIKBToNOE4ykwJxsdJdNs09/jiESwPJYpvvT/7P7nV2BiTEe/q7P+cD63////+5Jkww8ENz/RE0kWpD+qilM9AmrRwOVADby4mMqS66kECob0qgAAC6AqSCYxtChoARLaDt4NFt1QDGCGGUIo6mqQNMXMP4uhpGOoBdE4nxigFwIpVo47TiKViIBCTaNP8UshiNRrchbAwI8jCH2OaZrb9xDZPuREEIFEEC8uLuUOijRxax0wo7yl9dDjOstjz3syp+7p2qf44XcaagnfgOXwySaKzFucWArQ2gkgk5cPIRbSHtdUypSJjmFVIiJVwAuVOPr91xkwZGVLCUYhGibaPp/d/t1/s1y//tqBm5Cacrx4kmygffp7mh2wGFAKoYSP1lwjDzHk7y2ZS06AWqqHuO5bjOQPBNfbDAMKtsoa5BsPs0WmW1iTwJTO7DEeaKmI3jX6kTWHjzkQJUHEAUUIQLLioXZWKmDhcaDDSBUz1yMTm0Z5xGfjOXeyixA5twmIqHKI0/PVDpOG1nQrJ8QCmAOJQbGa/HXyotAWMgEAEVHJPV9ZyOpgv5pyi+OrnR1fgYqrxym2rntGeFwwrA4dn8K+fYimcBAhCQAAxRSo//uSZL4OBB0/0ZtPQ2A0oqrtGwYYl2l3SGylmsizBmvoAZQidCkbwFwBUai7MIEKSSwACwEckEFF//////cFhnD5R///0lE76gQAAElOuCERSFFQrVbZrKRCpEBrSExWjL4ZGya1ALY3geqAlMIzLnLf/knmGEJgMcbm6kOuZTteomEQLD8sgODG0jSsay11xKVxOHZXdr5070QzW1avVeO3TOxDSQS/IhAkbhx9709H46iKIQDIlFiocmfmb2sYsey5PgiUD5AYpEhW7r0P4i3zxAHczjTGZLCsRy+pVssxMbd+6xO4OhwlEttCYihoeLVz1RzMh7LauryjtmI2BqFhCHZhkvJ4XSEUa0xqCZ5iHgAACCe0OJIs8shobf226tCSV1sKBEKCCQjCQRYWoMDp2u/FvD5x3o1//6pQAAAJpoha5RZNKNxmko/t0g93nRQTs1fmN2G7LpbUJuMagOhFTwYiPX2dIKhFLyuH4xKuEiIiblXoEYyROQeTbGq32rStmtDIuq3xnTBiC5JWLGtGvPQQIRWgjWKXkWhlxVK+xP/7kmSshAZFX1U7DH+0KyM66CRmeBC9aV7sPG/I0wzsPPQUoFHL2vyT5/3vkX/kF42OVpIaHcdRAea5Xougk5AEwbUZhYOACAgAAAAMiqY1IUihDrVacs0BnJhy6oOa6vmfohTMxEMblQNM+cZwXdfr//lPs/////3VAANEAABPWmGAPyGQS0a6ZZJRY5i4J0hjqYyF9WMDitv75Kg441n75hK0RpssXCQwJyoG2qJPTcSgEAGrc6Wt2VVkQN38TfSUHTVRbrld99y6Pn/p6515QWu6h3GmbK1f8xVwgxzKfxN+bVzfWf2oGhkbti5iuIzjFWUClsect/9jIACKkogEEAa8wv66G4O93haLgg3aKnkd3VQjbM5k/8YT/8////1////////////////wGfEgAE7wGgRhJzC1GWP8sAlatSWqnHnQ7WZ3GoHpaWGZbPWWqE35XuvRw9LJmkgGxKV8wJSTriXbliMvvYiY0alrznO5Y19Z1NyJWDCtqjzR7G1RwbHV1Kj7kW0Nnb58alh3U/vUCGG70+9H1coYZu/bJ7L/+5JklAoECVLZUw9ZcjTry30J5UTQTVthTCBcgM2QbKhnlRJQUysVZeqPQIdt6BAVgk7CQARAAAAGjd1CYa+Uz1DSBayhD18WhDu4OesZflDjZtkGsoHM3/xT1ffu/9pjxKd////+SQAANmIBfCAwlVS6Ll/Gcglws845UFM5WBqFskgisOzcPuw+uCl4XMik65sw5OErrNGnICFBoHhp3oLlM/V1QQlJ0WkV1IYrflO9z9mrBUDCMNUOFvC5KZFasUsPO4zCRdy1pyL+KHVapWk/H6koeBrYWneZIq/3mR/4MWoMDLS60ScVzUzZf79CDvm0A8+sAplSSIUKACckh3aKxT6f/ortIaeM7AArzsQWxMQNsrDQ8zIt9aX/lQsw+hcTn/3ekN+UNyIIAi5myALBaIOEcVOG4qEkLrYYJHmG5Nclrc72p+1CJFHdlRo01U0fPGZscYMfUAckZblXFMVgF1i3An0rum8fedVgKcmjRevhJ3cOAHhC8zd8XLEiPbWVSrugwJg+5+kb5Elc/f8WAqI9j/tr6kkbVf039wfL//uSZJ0CBHNW1hMpF5I0hAutBY1MkElfX0w9EwjMkyuYlB2of6/6ILN8dXBLCZMBAACw5ScRcSo4DEsLFRfq1bEkvqAWdhwk+BtjAW8tDPoNUUAUX7fzSjf+R/Ku8sR8p+TVQAAADkgxnrA4cLFn02OJhY8KHBHJjBmGN6AEicn0BEaRWfZxlfIgxlvC8Aa7BTqKdRlN2FV8ZY/bCBYGWUuMscmWWJcuZ9n/MBF55PS46ku+ZdO1ODRZ58/7a6n8rRzF5LXFXsKDIxlo4CA5LxtX3AdC5q+tLXcAuAefGtrXtZIf///8PXHHEdMUdupEQdeQYBnGewAAAAxngBRj+ZFl9+yerA07Z1erWVCQ+v3HX00DbhzeKw6tzwZ+JWeKN+37fr/eYAASCEnLQCHs1jQxxvg5JLVYdDxgqUDkojNfpKHry2tw5EJrUDp4XOXO0svyoZVWlShU5LpHGtZV2j6i8rDlw33Jcabzr3X/dbh3L/VdAQomhg1ZqmRkYPNfdvM0yl+Z0HghaiZHL+ZHpGOZHFmHCz2m9LfO7yCYKZOiIv/7kmSfhASaS9QzL0aQL6M66zFoQg9BX1+srHiQzZysPMQI+AAAQBQ014ANIS+tEApwR10SIC2nHNNCQf8XipgwJj3Cf1GMRzf9P/3f/+//lb/4V/pVECACUnKf4SkR8YBcgfww0OCBRj1TIuBTRktDf0gMaf03qgsbdmMrGogyhs4PnwpkdUR4cq3Wdh8DvT/C5G+qcMiJ2XIUeUzkPkYjOd83tVfnOZq9//vsdP8ougN8XHjW6zIpS97QqwXAAYQzslVRIDqYIU685PA5Z5Q383pFUIwiA6WsdxPLBrqATkUkvnNMxK3+89qw1KKQn9v/0/qABEIAAqX9WcGRAEBPdeScUMI5QhFJZ0iQxl03CJKuZixkRCiZDIDygkmqI+a9YcK0I+NmmltqOLCb614j5nezoejARi5bOOLBQbXs87EdBrFbyAhjD1MN3RihjS+9H+rM0j2nkYRczhCls8bcfQuI4X4yVmgKEeXI+FlIqhsL8KJssIIE7/bUDwjAic6si2WzyhtnzUg/dzwTZXYxooZvW0VPbaD3/0LQBgQAUpf/+5JkpgDTQVhYOegdJDYkCoI9I2oOPS9bTLBPSNYM6cDHpGDyRKCNewcETwnOMgQ3QRyRm8NsmfjCHHcXTnjDLvSWylKtVCjUHSAeKOUToRLTBQPNMbJmcQCt0vfwrzqRzSoLQhg4KuvlIUXQIecOXOGjIzXK76HW/z87HMjrfaSeXmKjcDAVvdCcyhqvXaAAAaAJ3QZh+eEgdSoJqAHITx0QLRdYo44aEv6bAPTNzBRHe6cwxUMWSvc/7pYJRyl1kij/50kAEIAAJLm7YUbxLJnkaXixx1ytpbVOGo9KR0Oz63o09+NyURN2cR0tOwqDEzjmFjMRgC42WSefbmaqZF4Zm37b7KyjW36nHzSs3ktz1ZUQKhunxAMlUZ/YZ0ryukqjnmL7RWgMgUmxZo4kzQwsD0APhwLiJgDpPM6D+UzkngzJrL4S6hXpqexaGLqLshfgvEgRePlVhGxgei564JlmOQmo830VAAW4ERyNFIwjjPyD8iSgIsMshOFng4EaAczKUSc47q+odBbnOwFh1MGuSVWGHmvNTcuUJ900eC4S//uSZMIAY45I1tMJHLI2Y/pzMMJsjcD9WUwkU0DRDKmU9iGan1gqMxAP+uOy4eCgvQXLOr35yJvUbmfarvQsc59m7Z16QIu5SP5hxc5iJPOZiU9NWFot/0eUu0/h5W9wYzsDx1nYL6hNxJzYH6hpcBdEeg+MFgeJhtbIckeO1xSpImyK9NW+xYgZNm4pvWoEDp288UfYH6jVHQSnFZiywhHg2SNwAwMQigwQ/pb2Nqbhw57nwZPEXdjdJE44xOythKEwkgQjuUlNzQ/sAlajOYVS2q1WU6GPc3BxhlYIyMNn2LgGpmf08xyoO8N1ImvQ650R/Wyc+czpKLdfn5fshl391uJFfuf1V1SL9KEwIiALJo6x8iHK4+SSlJUIB4AZTQ9PqM1WwRvJSwBJDDiq1OZEP/YOtHzBDo04j+13//////5NAJVATPGAAjQs478M8HAVIfGFiGWImHDGKLgTKvGtMRhtLNZqjoWMo41tc6TYm1Itu7Z2q1UD0Oywj+21bwTF1HOjKu480iGmNI+QU4Sh0B0ksoLqVcsO6mJNDArpZf/7kmTbjuPfP1OTLBW2M4MqUDzClA6VX1JtMHLQ0wzpzPYM6IMUS03sYFQ5gbnUg7TVbOOmvUjOHoa12tjdu3V/ZzemM6GEuGAyVcpO5Q6oRTWwUcLJ3RnIux4FuLwXUQ0TNRD9QkFOdLihS6rNDajjma2sdM13joVcpGpiMVm2mULj2tIYRM47aaLfKtI82v9QEjk54J3UhkhKTKR522QAEo1xFN5g68UtjGAmpP5CSBzofthbUEji8sqfay/qxOGMuy9q5uPUthpPlNZ2swNnOxWHy13u4UtXP3AiskD6haLbAQcAlncJTiiRvlL/LRT381Eo2uRy+aSEeefP8/L/r7vAcNpjBV+osQFAA8iQE2PscBeT8LBWDMkiWyjWDWY5hhp/APbUNc6ynoPyEIB48pldd3rKAM+4BrZYuj6VAAACdJRBgiRopIGOniLECEXtpvA1qwYDGBEFLbpcu2zuMKHDgCNLZafcWgMAiY9DDR1M0SFK3FVsjcAr3Ygjg1h8GSPM3Z+2J3U/mjtYjzO4xM9jjQPk6JZRAcjUel2UIi3/+5Jk7g6khzhRC1hi9D6kuiA9I5YOpTFQbTxtwNOM6aj2IPhcxlKqxiWu4YSJhqym/XC1vvlDBJY9QWNh45d6iLxEXDjSrMftQKEwAwDb4rtQWYw4A4OGl3wlg0eDis3n5mQbg+KwM+kru4McYm2UDxuAfaeIwYE8lIrSXQOVFC7eFNqm5EQVgeuqk+0ACM3sJ2qPDQMxos+SIy79R0BFE4wILTAAg1dMiCgFhxpKscoN80EwCFDqL8hCQMI6ULMEvChRh0vCxtgsZIkWSZtjOaZxc7EccLAimKqF1cHtIGoN3KzxYAogxmZoIlBgmI2MlSx0z2PA4ChnLFnrKWfbDhksr0RsvNWjPY0U/gW9Co0i3BwiCVfQlTYWnD7i3m0yFhQjM7TCWB14xOzNYDMcTMgpKnC6z2piG3yT3Oe9h53j1GwkLKNFw7lXDDW1ioAAAAAALleYeBKqxtQGGgdi4SaWfGExYgWqgIMpQ6NiVBYYjHn2V03Fcz2pHJAPBA1R2oejD8wpSl93TScZdKHGYNCoDffwJDsQqpSYV4FJRW1P//uSZPAO5Ew30ptJHpBFRMoyYSOWUDzLTm08bcjvDSkEbDAqFSIuj4joV1LMSOj8tVmsNJ1oQrGBLerG2BmZ5ND3UyL21Jo6Jv77VTdmVCGfavcqsrNZCBRFbB7E/ExeCFm9s/B0Q1ycpvxDmTCUozryHI5PkBP4zHhSlLh9c6afMQ4U9kbbfRSVlBwkWB8JwS6HlALSmkAgABTu0wIGkIQa6WBxUEwoKBBCXZUJh0FLIq6alJJkmvoBWQjcniAV0A4QVRgnNQt0HS0kdPEJQKbc3GTStXn7vilK0DGJyq5D69NqXcx3tLHzNu+eJD+VNSxzv9rxKDhzpX4bv7nuGd5/Jtdcf03UB6VF+HPAIfOuCIC6AgDJsjNspKHSRUoAUMk6ZBpPs9boqC5m5sJ/71lkkpN8vcJfROPvMQABpsZl0YqpPlNPzWAVQ+UAwRgqEH8KApEjN0RRwViL8yFDF0nvfhm8FJArRSCEg0pWBkbCHhZYwGPvwou+Ebaet2URJr70Q0n3C2lKNwzIZuFV3Ft3j45GoaB8UO1KhyVZw4cHhv/7kmTogPRMV1PTLBYiPMM6QD2GlA4MyVTssG9I0Q2pQHekGF2F+G7jVcQAhhY4urFbnREQSH7vVyfa62LP3tRjpZa0GmIx2K9FNsjLcy0LIDqO5dbrJhpqji/S+y6V8KwpjF1ySE5LHazkRgmFZSXjcZPHComjIdlhseHBmfozvhKFbnNxItNooKwYt3IxRlJCFBAAmpTQFggBJyWA1AUllDRcAHAK/e15mQNRcURQAXSNVBW82Yr3yULlji3S2eWOl6krnXbBWC8RBUxRd7VtZ6svDbXGsxTCSXjDFMPHufVdoi45VWSt4uWnZitUa9UZhBms6za03kbyd99u1Q5W2LCGIsdxISwCMqhiVZ4mYd7ZdUuMWvYkxADE5lYC2GdF4c1cYJlHSpkN6rT+RCElnIdW7WoAAAJ0YAzJWA0c/Mkgjdz0zYiAJgIh0w07IhVwzBBAzcKbkswiCFoLJb57xkFGgdTZUTeg4PToYctFNhc6SC2oeW60tD9OdXLW4bmIedB62VM8Xm0+G4Ou3o3KJbb5bu1aN6aCjpqqhIchBuL/+5Jk8gDUrVdRk0wulkRD+hBhg14NOV1a7LCrmM8P6UTzDhigrmLmdA9Blil8KTbIb4DOi1ZZGz5Gqm6tlem7NWr/OVt2ci31dLpSNKhXrhryT2A30fGcxBuav3HSvLvKCxS/Pv1K4u+uTRaNrkvGZ6J4FSUTT3XTY2CtKqPWFbbFFB5CPf/tIAjsFZE7UdGsosG5Bsslv4cWWm8czp75JlllQoAIhk6X2l5a2cbhT1XZk1yMyGTzye7LDChbuhFhccpiSF4NlR2dnSRBZYJbHCLHfOnJTtiOSoqLzTpzNyRitzUyY/8vO9+p1+X/C+CFB5g/jviUUFK2jZuAq88p41Nn6nP0wyHkcZJMaUrCeAUCqIqtGA+egoyhQCIGDuSeIWtetUBdp2py2Wtrvp7GhQvHih+pETbNCAAC8RhATBMGSM8jPgeBRU5pczq4QmF0hAVZxgyoOBOC8D0QGxBu7Sk3q6xWSgIKppLWtKPLAS9w2nQO1loo4Ea5DlhUsCs2j05Ay+H1Y816PTkipI4VaJyw2KmkMKOInEMFxCDMl0nE//uQZPUO9LZU0RtmFxBHZLoAYYKWDcD9UmywcsjXjWkA9iSgTBwOABxBwKqBD+EsHS2omRPOz5o2xFnsnSzhzlUl6DOC2VKNJG3/ZAJ53AQkLQA2gEgYJjj0nATBEg80VUAlHxO7S4SlRIFuHapQJp9p4koyHWsq3GroY4OT0yZXB8cgQMaQYuSuqNTRAAAEN3N2EIIx0UwKgwIAz6Au8AUYGCjQ5B4vIo0utnMw/zsO3Fn8X0zni5korkucWIRsQgHKvrG5CYHvQVG4FoVm00th2Mthfx/M726dSchYSUnt1rHIRHGSSBbNMJOWVyIjaw+/BIo7kNoV0Icsvhel/lPKFL3/sP0VKcw22ntYnD4JsxgQ7Ohw3yxGka+HOVWnmYrx48bbLyYQBoktYJLPb0IQis6ppZHFHqqcQAbtIyYvg6V8ZjFWmvd/////0IoAAAJxHgxig3Sg85QxEA6o5Xg8EMOENiHpTFpw5JQOBy6cpa/WcZMZoKNsaTIUCGkuq77S12mwquYmqGHKdUUjdCQPso/el8JfaXPw27To5awj//uSZPKI5I9J0ZNJHpI+w2oQPYZcELE5TU0YekjxkCkM9I2qCNkFhOcTiOlBXJyU0Lemi4lQ1PnX9uJ6WIVbcD4XeHBrUtOT7oncLhlUmE60TIsOUbDRB1xLdegAACiOU/zPCHwQ1akUilco4iIAlDCR9m9QhcnFELNrdZoN0mrdD0bLvYrV9MY48wLOPkcjOPFO/93/////RWlb03hD6GRgFkFkiD0xRATAnYTVp8GYFmlDKPxhQ1zUBwMqdfDTQ9Qp9lTRMgdSviobBM9ZmVL1lOVVxy6DoHQKKQ3HkMIXNCShaEjjiKkl27p06H1nQpyZZ/KlqDsL+b/5m0sa5bql7bY/9OmY/Utnmvg2GdKQAhgDiOYOgOAjucfBj1Kxh4kOCgmRGVK0v2b90oRv//TXQ0qtb//8OjQThB1qAACzAoVM0xY1AMjYtzMwBc0gJg5KGHy+Y9JZlcHGABMKC8xMQRoHoUmEe1hIlnAsWj+NIqGt6ZApd4DJF3mGF9jHPDQYZZ1DyuiqyDAptMUQAKOvy54qGx9r7/uhIU1XUhy81//7kmToDoRQLVGbWErwPmMqQz0mWg6kuU5svQnItyrraFAL0tzIk0aKQ6wl/o9B/L9UfXx7PDctgSB4kkbj0dVKsrxzy9yFuM5XWdv+JIti1iOOcvbc3bTXZdK231d+35flzHm7a5+uHjOWq6G8AIJ+4hMx6EADrNwtynIyscsA0aJihgPmjBaSDnG4YnKKkU4YXa8iuNzDSbVCnYj1f/67/u//+isAxgQRNgmDRIowADOVIxEaFqzNA0AHKHILhBeSTk6iqBqTvw2sWNl13Pd5kCVSC7T0VowvVRdpqgDME3oEZ+X9Wu/ldZ0WduA3DjDd6yGafDydl0bGxokHRIOhXM2oPOFB0XN8wfQldaHlK5f7vv0rpXX2Q5O6f7f37bcf8D/87D7JVYFNFJjjZ2W+b0AAknBKq1KUDYElFCFS2BZG2v2nhVrQyOfzX4p7T6VlUsvPvzy/WiywsLON9nzn/9n//x9w6gAACphAcNNzDgYReBo0xYs1YAFCCoAL3igoODJjgYveXO9iQcBxBZCSEZa4zMGAHxX9CFB1NoKZW7H/+5Jk8Q7FcDxOk5ljcjgDOlM9J1gRjK9CbeGLyNSRqcz0jGo2w15EQE7JC78HuvGqsvjCGkAQbCZXKHc2GR46GECJcKYGDFOQKpJD5Qpa6n8RPYPQXeN22qbFSFtxFLlcb/ojTxaf6/Y+GArfbpCyfy3sxxY1+wTOAQJLsg1awZGKj6gsgPNyj4kQhRtmzJGgQX7BoUEhoirxMGHnOjR/LU3cO/U8i/0f//RrBEIAAEpyVwi26EJKQwxYYik0REdYNkc6tV9s3hljDIqIANk7YdCow0JrBWQZZeOqAZaNGjiihCpFyNXzjIrRIGiOBgCmLKZgigmDMUOcILoj4WFEIiAAgpQId2NaFhG1+sNU/EVTFjrKbhvako7EsSx4ZUaMUJNXeUqSKDoCAAAbqIyADzpCRCpGZEonctYDnM3yTI4JLknV41np5hkDmCBBQmtOv3/9XT+hX1Hv//TTAAATmJQYikGRvCB0YoqHWTEElur5VsLwKAI+llYqglInUia5rjhBTLsyh9j/Z0BIfxYVgkxIz6UoR5seqZKrhRHg6Psn//uSZNwABGg00ZtJHpI1AirKMeVSj51hWUwkb1DQCepcJJgy4c0RiZmR2h4+yZyyBkNI91UTIG2dMrX53scvES+pbJA6G7QzfdWeBr/rEx3EGr9L10z20N//byiL1MCIAADA4lGcjSvDsVXEhW8WTZSy6SGscQL6khIJCMPVJPTV8aIDxwxBT93R+z93/////1A0YBGbxmakmc02bfuAroFilMU2pgAizTlx4eeUYYAQw5D8tWkMt6UokBgVnRgAYYMfcQjl6oQLMAwZSpcyKoCFF3GmiMAsVTFrEQXayR8muhYI6C0XZnETmkLqKgEEiKVQNAdRDSBE0LZ0Ui5dQXRxCqh4CBLsqXnUCFqq9U+VpybHqTlYzUcltlp/6nXEMSRdinC7wtLVqNji5cgP9Of/Wev3AASAAAAEt4CrVLRdeNlxaCYRz0ggB3FhdbymtAhhrOUhNLcXAIkBrp+kTNOm31f/xP6cP5+sH//0qgAAC7iqAeUIfcBAUJ4aYmcBlAsUiOmlJjeGEmWkI6MNVDJZA/yIaNTRUf6R/ki59JJLkf/7kmThjgP9KlMbTzNiMwMqhzDDZhRpKUBNMHqI5Qgq9PYYGmU2BHj0EEXItqqe6qf4wntF4+mNQPmM3pFoBEBwDyQgFar4xUaVRNKHrtEe3gfSQJfN/97WK5sVNj0zNxOdT5dN//6BwXZksqkt/37eONWAAAAAFbcQ1GlSKQyKx6XT6BcPZldPKx/KUAmARJM4xchR9HTJGpa4q8j/d93+v/6P///aCoC0xiZsb8aGNJJpDWcgCghVKHc0YeLWmZgyLZkAKRJaS4hA06AcE35MOgL/hwEuVWBeSd6l5bASBkKUEkDpetCVmXequxt4nHeRmaOLdmwyBjzyObQPw/tScAVZdWBMeFfcaRqSLHkjxK5HhbankI/y/0q1GFS3pDUEFLOc42qwtSKE4TLMi9aeVzszvlhC5aobSmAAFXfjFhAMgPn5gysFhOXCzMIlxx9dQUUI1UNCj2MGCwwqQFGNavnde3Q3/keX99PV+qoAAcHB01muNYczbIA999NIVDUUcwp1BLcYqCFgJMGBzZIOE+KtHg0ACJ2w2Y4ySaji/kT/+5Jk2I5EDydSGy9NIjQDKooww2YSjTFCbaR6gMwJqhzEjOCAKElSl2Ojhz7SadsLTFzqouyjmphTOg/dA4ENvdA675W3OB1gHkj9IN1RGIsb9348u0whHT6biWZT0FH740ws39eqsjYvT97JpMEUYNc7nm6AvmKBavuVsZh9kLfTOvftcAA2CQQXGN0hXoyWIRPBwTAp7eNhCSfiae0J3T5V7/L9f+b///X//+bx+BUUirXkv1d7e4wYNCrWc60i2aZ09mtB5gR8Y4mGTja0DAQAQjBj5AjWXbYk3JWlkSSaBoGGxROIwaBwLzSwEZeqtCRi0nJULhCSIgAkKwVAO3JssvZ9Dy31Y4Ogh+pK/NPDE52PKlVCc8nbYuhEdl0KeKKMmG2XPcnSU28U2Ched4dTxvf/Pv2avlsuYz3S/L1JWdQHnLn6ACEAEsuSiIVGWTZHneD4G+/E1jYPLDhxxIDj58wmkXIj4WFgwwaqz9v/+rYn///x5WoAAAmUhDh6BOlGBqbMwWzCQEzgWAgGAAUoLS0JsEfDLuXklZGEW4Lk//uSZNiPBKQzz5N5YvIzx7rqICbJkdi9QA3hLYjFBGroJKQCD3Qe2BMhfy7nDxaAp2zdTdgDJk+3hex0Wrz7cJbMRuiEB5CbZxpORZ7a2Muip32+k0LFD0FKnmpJvDJMuwJgqIYDcmUSTaCMgp20AOW22C73OPoQUAFF66AEAgALLe441VkWgmVmpre7Nbb4+gsEcTmZQc/+Vy5hk51Q6UXT/9f//v///o///////+FiCYqXqLH++BhDWjCuRjgKXmcqpgrwucIBEBqnLWV3u3HKe9TRSVqw2aepkSAZCoVF8wWMJDTlp31TYsjDwhMkgPSwqIizENn5zI/W0UfJOFA2sKwgpVrybHu/5f8yq4oZvr6ZPP7hfDcr7fv7upq/QBAAWnaJL4vMCs+PJ4kEu6BF8sso3lBTVJo4fBNI2fT/f/z3Xj8EW2lg1EvR9H9f///wiyoAAAJxD0wRVO4TzFCIgVDFgQzESBTADicywvCBwzEZMACkwGwo4MdU4vSNobrzQsKKVPenmx9W9kraCEASbbq0pUjgNLZe3RnEE4x9/f/7kmTTDgQGKVGbeEpwNYqayiQliM3Ej05ssNKIz5OqnMCOYppoL/uvHJ2WYTUGnoIjg++GwzpiypKYMNwaYVnlIQYwfUpiDkcb9zpQzMk3yfbUtVYzm1o9/bd+tkT7/rGcEwACgAEVZBgrMDor4hrDoSLFpH2EUjDaEbkUeq5JM4D2TWaIfQZu3/d9Fdbvqeyz///vWCrUbBosE/YEFwNFx4JDFAKHAUKTIQ4tCZIetYGQFriV68mQreoGCpivKlY3JrTcl+F2G4NIjT1IlObAr7xB9m4zq03rci6zKy0CZf6NQRauTik5RNgYVpzagBqpZXgzr19OYzrKiElbvGld0R3euQj9+6mfRmpfTtLJRgbMuiYnNfa0sNYIAECAFNvtOCCNKE2ylQw9wOkjlOWEA7hiRRKouzWiBAETFCDqG/dpRr+kt/1f/3f/310AAfEaccUTHKVxrgwfkHmhghiZaaKohA6SBoFCXkGkpQd6S4DKRYSWXAagbWU9C/K6gAGJvpnhgGrlaMDJnM+bd/IPZEyxShaa/2wMjGQthSerW2X/+5Jk5Y4EX1XRG2kukjLBmqoxaUCQrTFEbZhaSMqIqijDCVjrNYY2GAb8KICCEm1G1S6R9hA2ELYFB4LvEjEabGkcu3mG/cjRRybsitTDAicPnO5wppKZ/ZGyiqSPO/uauKIvz8EYk2YPEAAGipMg3g2zkJOSAyU4eK5TCPR6FqNDI8QmBIASYKTZGGPK8JHuNo40l85Wq6dfadrfs0//7f/2f/6yICjEZIaWSmlQ5hQuYo9mUHAiCAxWOHUsCG0KSgqwqXtlDi1lsWbVjcpTuZO4I4LKmDNwf5gVZbDNpMzCSsyEPDgtgMBoPTIEhcajuIZnhmZl4w1atWMcVo/1PpmexM47rK3KelsveUZTv/87IWnx4rnaMLSj/YI/bMPADs9afHjhrWXthc7smJ5fjgAxsCykm7qgMOO0lhADCWgEQAnGnms5lMOuFor7rTR4CgkXqObv+hltY5VRyilh3/p3Wkx6AABk0zT3Qz6aNXG0VzRx8iFguPKWBi6ZGWBQkLAQXyXMCjCUJCq9YjG1ukITDDdwwPRKaaW/dWDlA3vB//uSZOkOBNhPz5NpHqA7YzoiPSZikVC/RG3lh8jTBWxoMwlGAMoBJlFiQE1H+KEm6lEMN0eh+GAAMC9Jv51GftTgfNJmD8i0NBeYGJVqRkay7PnjtV27RhFxdq5Ccq9s3mSkCkFnc5ytMlOecg6Dk5rkHxpvT9veWe2ZPiWz3pjZWzdeKmH+d36GXE7Z9pyUe5MBpw6ukAAIAAEg5JRlFMQQSXPtshNQwoNEPcsH/Ybl3/6g28mUWr5NZ///rH/xv/+XNa4AAFFOQCZnQKtCwIOHH7kHiY9iTiAh1cqPr2VUXLcnVaZTzoz2lhRJr6LuxoMuyOLgHAWBXh1w7qRHqxUxmJEFCLw+WJfZNriWH80ex7N7PfceO/PU5ibRGxYZDT0oVHUtFg/HYfBLSHKgGdUMfnYFnfuzfWoDXpNHELvn4ZuZxr3OyIukZLWt5hzkTMf7u2r8a9eszKfkPQUyBMeJES19Z8VYTcV1prCxinT3TMzjg8ABiAqAAEcD2g2Xss6oHyVSDVDI4zFcGIfkY/OqNxP+T5v//88UvE/////Xuf/7kmTdCAV0WVCTbzXELkFq2gzIEpYRgVTsvY/YtwxsNBMIOIgAAAA2ADOMMlkxRzbUDji4oseFz1YTFoL5O+rd1hTgLspob048Avq9Kjqrn3XamfAUNwXQBAduPIuS2aSJeJ/EH3v2v/CZpYy6LowLE68ljQhpOzs5wSKunhuhlg1QHnSW8M18aVFux+/ZHA9jkrnOLeqxILQ2Mhyq9M1OfuojGJ/nYR/l8LLOX9/k8jWeaBSpYIlzgP+RDALSAAQSACQAM6BApY6Ex8B6NWi1vv1jg7lp5etgdalRgmeezbLt+I8C3Ccv///////+36IEgA02NHxGBp5hhykEYCIJkAwScMZBVBI8w2dlDeuHKpVaftuLqRcdCX0emVEwM40Px56XdL1xNDGKZqGNrJF2O89TqRXV6Zljv2Lc3Lp67zjNJyCXsscnZpvYFo7E7Zs9rPrL6hWV6PpdszbgKfFXeU9PjnmoVE5++FZSLrCcTHM31f5Dt9HP69P8V9mxgcAyYRQAQUvAE2dwrDt3B5Eqm0DqXQJ7yp739X9TICEszpn/+5JkvooE0WDUmyweojLkGvoYJaAR0WFUzZi+QMqULHTBnRifsplRZ5rP9B1xTa/XN64uCVWAAAAAMqjpUJPdB4AE6XsABgwAUBjQSDjhMAdu+vOccitNwBIHRXBIkdWcuIyBEq3OU95ZBQfLUwpXiFND44VWrzGdXl22B2x/d7r1OwkemBj3Wz0l6ArV1Cl3DPxmqc6myosNd9DhY5xppr7Et6HEBsb7HE2PZqhZTC/8075h5jdM0nTo6LtrK59kUo/o9irLBAn0alDo9pkDaSNUc50acPB9THb/8D3clXKCXfmyhFBQKzs0Si1aLKCIS5Lof08Z//////PJAoDAgAQADNBJiSnsYMGD+R9BglczDzU5TwRaVRaapy38hli3YLhp2rTgr8lraqbs2VSRilLxymXKUD3T0s8iuQuK7LpSImkNNVlozieP30/3WpGgKSrutQ/EayWpX0kvCopWL6kDozBSs0001AnHb1xkNuaxpEKv7kRtjkIR6JpMXv0VPScMTP4+16qYSt5U4+pm7FCIfY9Nerm2LQAgtSAApAwB//uSZLYABIhhVbsvPbA4RQtpCMdzk1WLUOy9VsDYHK00Fhy2JwKlW85KyVZ+oeH/HlKKphVO3/aIjzZfQl/EwzOEp9QEkfx0Irft/f/d/0I8QAAAgAAACdbIMxnQWhJGcDxbMU9QEAWIBV30i/2dcsUKOcWZY0JiMPPDBKla/nkTsY9aq144lUNDZtXeQEdy2RF9TvUBi3KyuLYp6EYGdZrgvtw29VVxvPtVfgU249RRwY/cRiH7I/0cXP7oASIhec6GFBKGypWeOj7cesOi1KVOU0jT5RX4jiksNSCmY1EUW0JGmmnVNZJIokKPMrrwE7KobLCpTa/gTIxWDskUq7pt/8nYeQzHkYz6Pr5v9TG1a5gZ/Qub/Gr8iA44IGHHxjiwYGomEAh2KUYM0lgkNDShZPMmKizKCwWBk1U9ZQQBihqujBPXYl+PHqImLKGqRwqlM3Zw9zSY0YaDiL1ZS6D4qIs8YEgXL2cKzwS7sKtw0tG9J6bCzPzA4Qk1Vp5BYtP5HwoG80Sq8l2e2xuXejaBKL1jYFDF6zZRogyHIWY5m//7kmSoCgS+YtRTLz20MOarbAWHR5TRF0JN5W/AxxQqsMec2EnpzN7MpNqv7rIdl8RBvBHW+uLRD5UsMAVsef5E3TdQAAAAAuLBsEv4yI7fECwzR72805dMmqTCp9GOMr/sHVWbuRn60CxI1fmP+o/7P9/T0wAAAVBGQEYY6EkxCs+qUzj4KFw8WY2+BUhC/BQ9gqibTWNzIYdjS5EZWupzjw5OQLqR7ixF0msPXFS6jUhgip6OFAxtAFkYqFGAqFowkso53BJBZLttqrm5gXAO5sewUCy0uvBWFdSFeLlsJRGiMIr2caDwNMhCSmCc4PLe2SVfKvHc2K1xzqIj3XdkScbdwffc0m7Ye4NYGAYBFYkpw3AQymd+g+0u6pWTeVMSFzfq1m1PXP07+chKqW5ndaBYxzDP/xEB16f8ryXWFLpkVaOgEKoGbILGuUoyECJpkBizW1emH32uO+/j/uM50RbaNpPo0z9yBZQ1lfDyITVPw2rs4dLz8HzRxDhpe52bQzMw9goU+mzc6ADWXYnLcdP/gtdnEBV6LModK7SGoIn/+5Jklo4Ez0LRG09FsDEFCvoF5xyQCT1ObLC2wM6UKUD0ieDY9yq52apzOAo+hnUOiKFPdkZHb1qPX1ZRWypzEgxzv0TB6hSVP4GyP0p1Gq9RYzkCeT5MssgaL7gfWk+EFKUl0quQRZQPpKdKTYYRr7fzDf5VAgQQSlLYHlELipMl8FjUMFLhCU/6X76IouHB9Lberr+PpFoBg6brUE9UnKspgCUNIXFLF35LNpJh8/RLz+H0mSe7mIIi3DXWomFJPrdbNMExko7mMElkNqUClu6sdleItdiuR7Pg1aNjRz13r8YSBRcx1Zms9yp6dTIHmlT7AdQYBiTokXRSKiChlKsFwsSNkwkiIWgqHFELEtjKO16nUub2jznU769YayX/2gAAFWp3GMimccmLcHP8HpIhDIaSjBkAlkuF+JdsOVM1mlCAcEyCCWuqPLVkgNENYa/RsdYa7E6ywKgnnhhQUvIlFwrkE6JisNj2q7RsSJH1nVEkge+Zp4dqBiM3klrvr6diQ1Ee5sMKlxHMFv3FdUMuo5upHcRM+KmJX9qY0XP+//uSZJYIs95X1TsrLbQwI+pgPSN4EcUrSG09FsjOkakU9ApS/+MSz4BdK8nQvPbep4oja6N9UK4WiptDqDTRrAmvOw8IPVonIXovcFSgBDFtmZwere1keOCmpTOsg/3UONlfhP9CAAACdGQU1mnMWdDECQ1oIOBFACBBB6AAcQE40HIDhIDT6iSXyf5AAMwzhmdTuYkraVBQY7Uh6pRBRm+YYsY1VezIFWmWxrgV5WpsmS82x0JgJR64s9cxIN014Ss9swRv/3zPDw2rdYPfw4sSFJAbfJbHkjfpXnJ5EbHI36uh9NR0CaTexolUV2i4gXG8SFwAIQABA/A6lMZqIwxuayO2xPXjUKFZ9QeGNPS37y+qi0/0xhXV1Vh9nWqN/Bn6f8x/9TvVAAABCexIWZ3IExBBQ1+rEBF0sCpQgRehO1pSwcNww6SQMTdufhMMRaRxC64ztwLG25P5RICZfWbIq86w4JZ+eCTyczXlwoszmzjiHC49bX66DFXX27w/aCq7k3OZr5m/3ZKMTm+7g9lRRDLvOxCkCyfIg5O8dmX2dv/7kmSeCAR2QVGbbxzgNCPqej2CShJlYU1MsNbIuZHstPAWXqMy/n/MnJWUQ+hZQAAx9XcNF393f2QTSdRAQAAsjAAZAAvvvDzefq2MFGX5SEkP4fMr5nZc03b4iGlycVoX////////PC8SwHUAAfkppkZyEArSFXAZ7UHWYCiZapwUMEf4i/TS4GSbaC3RprYdN5L3YsxhTOMupLWerHcx7nTtRyOv05Mh1HpdFndht/7zW2b59goWts2+xCTbObYDSSJ9cjaUuS6BjKfN9pbH46JnLORDD0w6IVMkEHjuTNQpHfSnr5F/wPmdEFQfAlRbWZSjXrX1gQAAAhTg3MKmg8iZuPwfodrb79zLNklUxH17HnbSruibpU/6gjQ5EVPz/dwh9377v////TPwAAXmzmJRA9SbkkISQuTWUtMwwAtW26Qb6Mzm2WuEjY+PFD37hcUgBTB/YEjL+KZNYWouZdkTWrp96NaSh7sw1qHXVwX4y5nCrIo2ehmpifWXWfOzhqi+mwsHY0DQGY7CKM1LTqCtJ7p+ucY2NI9pcizpjVb/+5JkmooEV01TE0keojWD2rowYnQUcXFPTTDcQMITLSiAmipPCb7q3Kd5XEPP9KaY3xH9ff+3jW7O0zLt5Tnpn7+7RzQHY+Og5qIWAUQaBCWwCgBbyEE22LzEpU3OeNCzzSmiY8a9gGfMv1mYPL/7xfK+wM1S73ipApa3tT/6P////WoAAXJBznSGBTUWUXLXDoEAihafrZGKosO5YfduCAlwZUIV7M4KQ/lKwQEwLeKklhqFGaarWVKwIgJtOHSkEsc5bRJmuIxDkVbzGqSfUjQHoVLC927YnAcRLL2dt50kBY8VQ9aK3wYzNZzM7uWc/+fnrY4YphyXq2teV9jb/q9XuuHb73Qf3vrhbfXrYoYCEAADAAACmEldkzy/9fXrLQP0HNtVMYyI/KCFXfvH48k2Ma25hRzjDNIAFgV+/m/V/6xjAJmSkKRs3oHE0qZCwyGI06UaL+cFbtGqB0h4aQsyT2hNp740uqhj0Ftu75FLQKDslZ1WVjUe6fCQoUJ8xuCywqRuYlEJSszzHUrc4zK9rV7BBcYKpVGRFIEJKPtO//uSZI8OhHQ/1RMvY9IxQ0rcMGZoEblnVCy8twDGkqsYkSMIMG7Wihr7rF3nF9R7ae4uWNNOGnZWmMcVKibryC6EZvspa+zIzJ9iHvvxjs/bcfjBAEeHYeGW25SQQiKciVRIzbpoNThehOO3rN9T/IQXDLdbKzokb+hKa8HrIGX/yvp/9NUCBJAAAjJYMEQC9As0MQ4bBX4Khoktd4WDS2s9duGJFDj53uVLsqllx/YhnerTr0Raz8/TX19WIzn7K6Orus2Gzv8u/+eOLD7GPcXkNFhQFrnFVLcXR7gq+Viemr22fGesjfP2P5p97XK0OFK3DTGeNze968PZ1UT71p12mu9Wx4a3aABAAAqXbMBOhsCYUxygFlgI2VwY84kWPVraoFFYfletwe9nkPT92z98pObdKOU/oyCN+uEBFJyrwhyjJuQ86iXi4AZhnI0sLcEimP6EhsF+erk4KXZl4zTT4p5rVp9b1WPNC/Vm968rv/O/Laz8YqNzS2o6nEEyojHXwWt73V8kAcGyHpGtYtdO121lVwot7FojXsV78rHK1//7kmSOAIQYWNfTBhcyMOKrBwxFko6RZW1HoFxYyh0sjDSKgqMpCJ6zKtL3R2B6fmgAFJR0Zciesmbb6/PLp5Uhh2Fz0747Jk+/6LI3+v/cmr/R/ayEC1qmgyi3cNvRZ/40MACYZAAJLchgL4wguIYeCYqcFoU4/I6EDfSqE5R2IZCCLc4Z6hCWRfZYxvhl5iw3DVpdr5O6qnsDctpzDAfum138gOj38JKPedKDvaRf3NKJdXczKAKLz/zywzj4/lZS29L5csC4qy2ZaqemoSNdx95e2Fkvdmzq+23SBDtETAAILlhGKVMKDwvAV+cCWV0H3p3iEDaUnqHkzNwX/QfuQCP/Z6fGev//o/+oBaVESClJTfHcMchZYguRhljL2ZwKtOk0Sb86rqizAhymngWREu76PkNbe12mFbjdms6HJbyLxCiyysaNv8oAyeb0GaIPBe1qPWgREWHvrNsBYcNWl/xDHr8/6s/wltuHL0srUqSY5EONv4JSHqZ/tD4+ZZY+L/qZJ5Gm76gJXSBMjgshrUkSN7GDMS8HBfhRdehwLqL/+5Jkn4AD40NY0etORi1j+wcNIoKPlWdlR6kYmMiYLWgxldJfT1b3/0Ff7oIBFOjsX0H/AMd/7/N////+mgAMVAAJTdLAzPRoBahBA2eC2DLZmHKtxtgyl6t6flV5hw2JfoFIzv3ysDFIbFw3u/T7a1FpCMalrvNn83//+MSDO1fWdA0dcgnPi4r6gmMp56L32DmZv6mjhq6HXX12OlD5tq+eJR9vzT7qIf7o/i3ObLv5S4v46p13HdIniqQX+gsoAEIIAAhCcLIJ05WntGDxmNd8F0MdlVvvOuPb1ZJNZQZideM8s9ldvmgyZ0f+7z3////pFG2YhJOS4wQ7zzCoVBMn5ey4OhZywkOBZIqBBOpsPpQtO40i6LeqXNOHaKmm2G9/YgGhdgABgAQGCe3VdsYCT3+4/sRdOv8eoqrDbou4gImS8ndHgfM3TVRQnpavepyaKd/XP1+q0i5urV/RrbV9NJQAABQMDtKOGHywumNTNWIvopVOQdMQNYyHDIWXjNlozAQsK72npGRPT6FHB+lge9BJv/9HlQACSnIcPAyb//uSZLIAhBVYV1MPW3YzY0raGSVajhj7Z0eNFljVD+oMxCliTqhhFmOCOlS+ddezEj0WoCjyeLWjyAPZk4wOB0MENZPQYq3mLaNaSJDNCikgJCGnoYFFtOrkSiaB8NoWaW4dj0Ozl2NgRpqeVpsbUXfpN58RNcLLzT8F+U5xpU1LGnZ8aIp0qh00K2JAABwAaBR9oKFx4PAmF0I0FGMF2KIVjnTDJZ450DjgSit09oEZAplh8lrm76oiDlrDZpffNf/rAAHCRMaSguU1rUBAA40SBguUMabcEwwAtyXQeEpCFlQ1DUAPwZJOmVdhQysUCEuAyAGDSeP4bDUfZfWxuFjNdJuRdzSiqaqocZWFq1RmfBUlZEilQg4s8qQo0NxH2sjlppt59qEjULjDb87zY79y639wUiey1/c6kcTCzQkMWMVULSFQooQDY4iAtABB9AFsOJnUKxHRBuIYNWJc4IOWch1HsIyvKhlLuxhk9+utF2pIyG3cVloAAArclKHgCKgCViAgHHsIQqLKPIBMiyGwJRRIJ+o04XVVtEJDptm0LP/7kmTDDOOCPlWbD0LkNsNaYzDIRBA850xNPSvAz5ApQPSgOAtqpvJK4xUk4zRdpCQkoKRFJcdbsTqu7bc6U/cLOZluVG0KJj+LLN3NWTVNHYpc4ylS3H81f9vay///k3/5OXUuMTh/zFL3F2XAAAgAayQnCd6qQbrKEsCjfK9nrO3p7vT1go35jMvpKSwSRMzJJWdZmO3ILUxVA7/jEdVu/d/0oJbjTzREi6vUteDrJQtITCf5oPgOEXgKj6I5WNgK3OV6ozLwGTtY+MWfSk9yDrrQ6Lj1EQeD4f2429V2giSc+GvS3IpGq784sRFHo9RA1KlX56n0rb/6ae+rMfGPGhM0eFwvA8N75kKXSUUIJspQIMME5TioNqe9j2cyTofeXKsik17lDpsosnMmHgc88NWP7OwP7OWBQSNQxW8Rt913/Kaf//9dAAACeC8oWsGpw4AyaCzZiBIliDcIAQBPYHAS1o7oRxfpbGEgxYj3O0k5VuZYVBMLM/bE/onwv00imBSBHZnOMnOLKBNI6CX181bmq9etwk8aSDbUTcDzcuz/+5Jk04qjkipUGy9KYjbj+lM9IoaNxPtS7DEJ0NmNaVzzDeDPBw0Or/Z3FBQ5nZyRgm7jTezuRp27Mz2cQFSKl/V1Yt8juqvXt6n+mshJiK8c4oNDgEAADAAAB29ILH1KH/FHMDoTjyYmePAA40utZKVcGnmoFXkkbW2rfz0274j9/w/9+7W///xJ/Tw+C7xEuSDEx5f45NhrqSITTIYVhS9QEERLEncVhfyZcRYRNqzgymJLAyGQvVJVHH6yli+GVCQkON3d+H2VSLGOT70qDhEq93hZPBc3hV/PFV4G4sBuMTXiPHFVxOAENvYsn+eUFj+yLtKJ3U31BHOMm7h07kqgQMN7medzCx2ML9r7n8VHSycmJo56upGvOoecfZM6DqnvQQgQI0ABxNFuC5GCfHQCkTnBAgCNAAUKSbkyCVj5cTIld9qS5ZOIxCsUVbVxzPsiLe/Ad12/UCMdb3/DaxfpR7WWbf//o/+USpUAAdaYXKHSEV4mJOEIMZDChCACiFoBgbyuc0OAnJhlPYmDbMvJ7S8pcN/5upBaABAnDFtk//uQZOuOBFxbUpsvK/A3ZKp6JMJaFPFzTGy9OgDfj6s0ZJUgTmOcBkIddl2HbfyB5942vOMXbK5SgRXT9V5Acaw+ULguiXnTiTedMTI3K00yEhrHCyQnm4iwvRZjrEPWFVI893CbUj/Gvf0ebw73eObszNEtPLg1hOCpYBYKJDxoppY8PB/qrXUjAVszvdyy05aSynVDTGwdsF2ppUDDbTQABbu+rUK3UM0MNGcIKVYtg/SMHW9CZCfcG/0/FkcQLez0fX95j6Pjv/orGOCBg46KgBTTU1aG1JlMNBhcQBwDcnFZpDNG/+UMxSYtAgIeCk0ZdmRPOpKRTjOasiH2LNZ9QcNdhi04cadhASaDqn2E1t2Pvawzo2xU+X2cdy+n3RupK0eYes6v268CAgUEopNvVh59iHucU6xZ1Jt3CgwaczsvjsNOcRLe/a4gp0+Ro0e2l/K6dujwFa5dRXvpAKMIDXipjUSJS5AHfHLNa+c2rfRef2c2ON/1B6Bd7c6hFbP//R////+JXocdDwhVAAABjReRPegiDUNSgZo/zcWQ//uSZNiOBWZX0xMvRrAvQysdLGJmEg1fUiykvlDHkq1oBJwypHLAStTW2yPOYnJK1/CMNgBrimEMw7VnbM3jYa1B4jABJ7vPvcJmHko5ZLpHUcIUigduLr44TQvjDIcxK6zMtWxqvWJCUQAujtV3lWAY1EB8ot6kXmabhMBAzWz4nhgkH6d8rSsSdEc2nUu2KX98uKcpb3T9ZkRQfjrQFYiC7dCpEAIBSgEAAC//z/BY2o0mA9Jd/Q/1L//Rv///J+cmjvajWRyf+h2Ob7USCHBTrIlbwwQ/QkGViWxXGALxDislOY2nYNGvt5DMmSoft9n7ZgThscsYwIxK1XfWONkM5oPyVkZ/JoTjrmLop1QnGewv3ta/6eIEipHZ3541RIWUQ+gOws9XQP6J2mm5l7ai7uETAnFbovff2w2No5bPYpUEmc7WZlZWGSu/OQKEMtKKrQ0e3woJhTq1rAihgABAuPXYjDOmtekDzwxk9JW9AHwKR60QgpYhH1EHv9Bqjf6kX+41j9u3//V/9f/2f+oAACZWiWhadc4pOPKpRiEdV//7kmTIDgScUlUbL0aQKwvLfRwC1pGJX1RsLFyA0RMrqDwpCqAcIjTTOrxmcHIKsoZM7zlAlBrTlqAlSUO1cVnMqo2ZL5fmxDC0loLAsUjyqRfvN457KPW3RFQaNl0Pv7hhLcZ69eISjeLbP+fcOTJHLusQSGafZnj4lWo6zp4s7fbtEvq+JxFAbTNWtrW1/rp7WcW3vorqJDCn9HPuJ/+Uv/UOK/0BTAeocsCUQQAEIBu2y6kzqsQTDRZ6LmPhXj8qF6CIjo36GZF/4L/jSoHX/9P///wlUol//////////9DmMHYQBmZCYUMBAwoiMUfUBdcWFoSU9EBiHxhoKzIPS6a8wyHIKgurErwUOtGa/OxZzmyDwbOliDLnGZ1alMbDi0aiFiq6OmeNEhS5alaz/c7XbzAl6vtFq2+cobMpa3QMby/DmPHjtLpOmkzc046a1NEoNTt893/orOn/TOpW/qMwVm+JF4cY2hj6IZRynSj4IwIsEDAAEAEaANy69axvPy1OI8it0S/PaiFK2Ht4AJHp02PYiHtpYB8UrtRC4+X/+5Jkx44EwljSky8XJDprqvoZRVbSHV9KbSxeSPuTKemFibClI7XaUf5gFP4UOoG/Dawx/9CSqgAACZRAACwAsFzDgAYxARwxAKaGBwcCVOjufUonFDjsZpUxmaMEKm35gIKEEhkf4k61xmEhlsOv3C3GEh8/DTG3CpIGldZ4KSOvc/jbyPKvhjV3WztKRpv5nlf1F70Ye5uDz97O/QaDF9hCbblMv/XelFZJmtrXIllq8/1VBrvVv2CT/jRIXltc+LZLlZbs9pI6UAAwAAwjLuD1iInMXoaYB55GNsVsrKwTuoBMrW7ZTj7Wb1Wh657RKcvmZtlwUd57rEyfQQECdxYASUyIsyY9DEoEgwIkWsGRDJEgROcIXLbh3NXVJCC9culkoEIBJhcb31G6MsdWH5/dDEFDJTTv/L4RH7FD91oKeHU6n67WuwGSZz4PyLH2FbBOX0tabmF0KAXr8z6CCw4MaaGWSlrPP6q/Syla9Rf/VobEE0n/ZVfJZvhKBHLdvGPSxulqVW60oAScPeieh6LQqDe86/Y+ypl2wRLL7rYy//uSZLUGdJRX0htGL5I0AypoJexID+kxTO0weIjEj+lhhIngzUiSECwaN/hH8Sqf0QABplxvZnfeC6jqME7D5DTlZkDFUBQowaWrOHbZ1KWWQCqUIBgZmsyVIyhlOpj8WYigTZJDMipIGc0ZDonGVtVO8cUtSd5Za2BhzwM3eSczZflk8obi9I1OsPJntJSkxKOU+vHGA5KBq3FzRZSbj1srN3PHU4pQjmUqP/OVu8ScDhHP4W6B7snvpukAPQYPsy1NvxEb496X8XcLIWkL+UIxMonuLt/fsW61Mgxv+6stB5CROrD9Ua0M+d6QXKISQhEyfTqSEijELNcJczNjLACwqwRnkPnMF+JiJxR9FDEAzNZCSBvKsE/kTiNMVyL6u1COwfmk6Z55q8ynJFsTDBN16jWf+u8YlfKdDot62gRMyxmay6kxemOHJFtH+7bGu2PsfS7mTv38yKmBwtWVtc/QjepJMm9BtpogIYlRJ5SpcvzqFKcx+g0HkZWREr7EHs5qWXt51FQ8CdypcYQoW0Vf1oUd4uTfmxZQWQABwlPzB//7kmS4jqRSSNGTLC6WMUNKQCcJJg+w/UpsvHNAxw/pYPMV0BBGkHjBnBsYuSggKAIBcAUKDQZmgcyQ4sEia75Q5VV5RFROdRBdoj2iHDS3Gst+iO5kevNu5iKym91fKlKKqmanpHBqtnVZWfKcxZVSWSJR8K5EsGlDVUQmPpvKVAzFJiV+5G9dnVzGZ1f5/v7KSi/eh/Znp5qxI9OAQQbNbRSmKnVXOE8+8Ger0+8gmSSBWc5iGsA049Azhtx8Hj+fUEVkWKqQxfkoaUrwdqcBBVRXmNxojqco3zry4BgBhtWEwJM6ysMICUszBAEBYqPQjGAxUMbcvEWsiSphqAhHJrxdMaIqgZyMK1JRhqjL2UTQcLutUf9E6GUW59znVXw0FwoVKXKlbIUvpU1tKuWz59tLRiROJ8QooI0EGnTKGCYXSRRuJEmztS8v7hUqiUwgtDsmis51atSKzN//+pzGMHA+ooXBHLYYGbV4TEcDRl6a6eJdfaba38BsfRJuTNwNJ6sWReWPOxPMRH1y8w5dLd0DaFPQjtqVAAALoCxgxY7/+5Jkwg70bjjQk3hjYDGj+iA9JWgRaStCbSRagMKNKIC3mHgVXHMJlJARDDKBS1oqBCgZfYqBBhpYsEoivoEBYMYenKqq4D/mAAumnGwZgT4MnIhcDRlWZfj7ojQJGm4ITXdbSzHH3bZhzr1JMuq3K8URPtIw5Dx7m2X3i9aiwsjUMFjG0xhhnOgY/neapN52Yuhq6yP6Xdh7gqvO9M62r0V2caKuFcuJ9QAACQCA73lTFOrSWGGcRFmmIE0OzJaycNa6ZTRIh2AlSno1hsOy5taW1pUZsZJp6rDp8U24ZvTZ6soBR8iC4KYTy2f+Ow/93U7ygDuIEQChFVYcOGYY8LPWto/hQat8iRLQC5tFR/Wq1CIdDssZE2jS3WGRyeKznHdWgiaVW43K3dgNScNu5KmdQ87jJUfH1Zu9Kjuc9T51/ablQz4ftUuw469BSWxriWbR1sACGHHDjP6AleyUUeyTP90My5+6WCuxUrmlRRjiMixO4gQQaW8/IMFMLHFKgAAIAAWP/ijqDLNPYwlJIjt/0vPqOtAZFCeU0GbSri/q//uSZMMOBHJLUJtMLqJKJLnjPYKIkYExRm0wekDNECq0kI4g+4tQ4w4EBlTO/+BKwJp//19CVQWAEpty8jQaRJw7xCjmOwhTQVheGclx5ngipV2ah4oQOdCTzfwcQ4+XzL5Xb+ZqY7PGuOVAZoG0HOONyQhbQxC2DBbGgbiIlbWCq+r8q4OUJSW41AWoKYCZACsReE0vFk4YCc8HdMVl4Cx7TVjOR3jaUNQLXz9WdHhgnbtFkKxuzCQJEVrPplJPosv9YnH3NYpNXTswO/PiW/Kwrm7c3WIrL3FolwHcHHAX7kGGLGNwuC7hOEBFnOTtbePKx/A0PxivIkQkJiWeeEhnmI2P/ovL9W3Cr1wjWtDqd/mP/01lynddfUGOaflBTSl3cgD0i0ikQs4iBrZvk9J+RqpJ04P1NG+n2B7BKBXOEbEuX9Jq9fadOom6SO8I4vADiP5GxIDBa8S2i2ALqqY4b1/Rng4ftSjrRjrqelLVYHmWfv/T1rZKf5zHarqV4tuidrtWSO4L2d5Vya3UU5m7RL1QpUsypI1Eg2NS5TzKaP/7kmS2AAYGYFdR7H9GJcQ7egQGwZf9hWtH4eAQnA8ryDCOWDx5pxZlmrO5RNoaU7gj109JOxqtTRW6AyrirkiUE4LlnYXiEPSGGCJsSVTqFzSMZVOJTt0zfAy51fzgQeFj9oynwO5xPMwZIibO41Ng/TNHPvToGc2HWX/+v7ZukuHrDbU1AQAAACZHUlS0BfgRlVufJS95Ukk9n/a62KKSi5ImUTvJI0ZcFmmjleo/8mhtsz9Eu1RROH6mVuknIZh9u5lk1aMy2l7FtRE43GcUSqlnhMEVjtBcYpFMbJI5Po0aBWhhE1rX7tBxj2VWZPbOmJTRzMkpljQdRxENQEiBhjqEx1qZIhd8n33Pp/5dLvPN64yndsz64d7lQBOUAABS9MbnW+SA4yUimwq1K6PatsaO9ds4Y72et/ob6vt2Vk6rkeR+v///DAIjQAGXYiKLAL5vWrZLWpvG56W46VUbW6KGZh1WHtMp5XRlx5u7lFJ+RWseVhwMNTkYoZmrbrTUVQLBIX8kFT69zvSpw1j5hvVxXz3QNlcfmW2atVrTFi//+5JkjgIEsl5Wuw8eoi3jCzoFJUSQ4XlhTDC6gNiR7HSTomB5q99pkzOq4WmfGlZLhBkohvF5oiMXTUWTXVE25jKVLTlTTotlVlz2UrL+dBVy1IACA7BABYiA8X9N+epMBocToGIB5FkqXlfMEfRMdahp69SoXMH/zMdv0ew0MsYbjlp+z1P9ZJWAQAAAAAXZEq8IKnYpqUcfNz2jPSh2DgsGgHONY8zgU7BIPdqK/Ol5mW5+y5PE3h4tG30l6bigdQeBMlRe0t30BCZENOlwZfDvAn+oLCwHoqfsJESwaHbeP2cZgMOeqqthNUEf/2v8zV69D7xTy0sRJFyJRR8YoyoNkHifSMJGAQAJgAAABSKjEhZ24eRyYnDMnl4pMxylSTfQlf7/tf5ebm/YnTZwO+U9Bf0Nf6n+c+t3/////pA4t9UKgY+OFTLHmxxb0AssQGs3PhQoJZinJqZVUSBeEdSGoot4mvckwf2YvviNPap8hIBc2XGd58gjMUHR/KQ36B4E51xf+NMHlI3VbfciOENT1N5NpBt1XUGxR5GwKuW+//uSZIwCA/pA19MPQ3A3QwsNFek0DiTZYsw9C9DYEaxokZ3Is8GwIGhcgfOioavILQSuQAB4IIjRY9bkCvS8MoeFikmZKtJIAHmAuRVepQe9n5UcDf8lFBAR/+LAuBONT8/931//////YgAAAXlHzLnNUo2bCFkHipmB1TImZAM8zhVb2ePm699/ZXFIOvKdMoX9FYqsWCJ+gbS5Nq5MoW4t6zdp4xO7sKGgBsttlet0st3McvWpa0K1cscuY/RQO8AFPu6t0FIEJDLUyfllUnQCtXNVUtu0h01/1LZv/f2QvvcyNdZcpUfbWaEnu3scBZCk32mAA0UEkjAD61O27kzmtTlL+USoqkn/cCXGsE5IG+gde9JeiaCxHAv/OMbf5xaP+tGr///rD8IzDrAQCk3T1ABgFEYZ9iVNYeRynOKcdYty9GORfJUl5k247Gsr6Vdt1sRbbJ8TbbzO2WHNWHzsK2ttazumOyTolMoXAKGpNaaK5oNiuxXIvMGFVJocpBhX+CXepvMZ5jzmq0d9XR6ojdNdWtRe4sZREAhnUyym7f/7kmScCIRaV1UbKxciN+a7CjzNZo2xX17nnFpQ3I7qFPGqwMvj5+rkUJuppWVyjpxPRZY7ek4fqzxrwZ7WUxjdUGVJHUFgCE1/5V2J4Ue/iT6vpsBAQABKcsEJLEBbLk3hkjQQolBdz1RQxWrLHKcDdANBkXzQi3wwvryuE9VpbuL3M9xYPB8DorNOpbibM7tlQw4AjrelKigdFlE28QkKkzsm5gVvmnqe3HcLSGbcBJ96SRczLlY1EGGVF36ep63MQd1FypC9tCs5GtaXBcRBC+ol4ETkQ4/ECcOn2aCdHLZGis+MZWf0EeQ7pHPlfGntueFqyq7cyz/1AAApzSwzFRe8CDmYYrYMsJ10bVAcaYQosHjI1oRRl7iw+16ZdMWFfSs2x1qMi21Fq8gpFqdbiaX5X7fW4rykZW3Nayq8e1g6mSyuENjCRpC2n62skmksR3eLZWXvryuvvllMnDI+8hPpepZ1NAx4w0IkqLL61uXSKAEMqD+ZB1KsW0eQoJeCxa5mEjMFGMGYTUay5g1VYzPN9wjmJiozpcniQ8nCKU//+5JkpwDjhFVYUeUdtjajKmA9LGIO+NNSbL0ywMyMaczHpQJTv/WWAgAAAAFSx2gJE0ILahqkwmfLDrSRGAxkJw4FQhx3oskR0OKiZDdFSW5c3J8xtY+1Q1NQ5EQrzx8zxy1K3oSrIdmKWj3GQ1BCuuhQ7qwljUGyZ7BlAH8jNyip/4OoSa+aF/z6XiDZA6zabWTSGUg0Wf3ssakAAUACrE1fwh05mWQl/4DuEpFu3LRQWJbUUtQdUfIqyOIDd8FL1yWyTy01gsXdSn1Zimi6vzpw96gACU74CCFAuQEiRtiTAEgIKky8y3JjBq2YehhuU5DMXi7gvbGmsSizQOK8N9wXfn4uvaXS4k9hhp/pwXymDJ93WaZGrklBdd8hmqjiJa6nJuq7MGA1bcFf6ISHjs9c/H9UcUofp33d/uF/cnVakvLf/dyAMAwxAUFYfB+VhgeEeRkBxGsqjk5uaA0gUxE0QSZgj5wFhQQbX62d/F1hpKmK22rFv7YIAAASlvB4IVfCBA0heooHFplZKRgFkZQ0W86MOvPGLbvSFuipYCfy//uSZL0Eo6A+VVMPGvA4xGpTYS1qDkipUm0w1kjLDClkzCUACVzPvPR5wp10WYxWNsvUw0TKiojErooj7deCO1RwjjiOvvsEAmdmbO7QxgqAS+nXMwsWTCZ27cPQAWip1xC5Sn+x49YdVHOY9c1H0oVqtcdN+FeOFKocJZBQyeuC65AyXeRBluzZtaZMR9qiY+jtmlYOWiICEaGUsLGZ+4+EWeXQIVAEFJuSWCiAO4EmRTaEvd7oUWuaOw0NQrqOUaAldGu4mHRUpQ1T4wPa0B54ipTxCyeh1oPf/bMdFt9f93FCx05BfynzVGRd/P/d6/dnrYww8LoaiGQAw9aglZGojkDDI+SVe6LVAGCBlCltEhYMJPSaEoOsuqrJI15LAyGm4SnAijFO4IERuDkQshy9hdQcwAyb3V53TTpKKwL1qqoAAFz0qEDUOT1FjVCTokR5m3xQ7Xg0cCBjKjBIMz2bNFSj5JeYDw/hkCFi6Mz4V8/ULVg41HcmI6HbnFwnEIQxhsGoEsYhlpxbJgp1HMDckSWDRS3ab7FBghOYox/9iP/7kmTTADOJMVS7KR2gNyMKMGGJUgzc0V1MMMsQ3ZHpYPSVqMIe4u74qEammXdBxcGHcb83HF29888E1/z9vXNsNcqtkYZbMysMQ4qNQimgAAIAG0Ukl5BjDXChGYxMAPcTQilRCwlrW42FQqEsa4qjXcwofscerU192q60tECCI3q1BFUZOaYVMzDli3+GSZQOjjPhjKTzNkzWHmimFGDy4eAg4mXbMEJrKpP6j84MnLc+NxCjYBUFuYmsSUbzWUJXqxREIdqYX6vyu0zHhoaTAvEcvJHM6jVB3MTNbKgguqvVbneGkTCF0B7nxtMmJx/WNlXGFwwyOcRz5yLuWGCb3sEBGXJNHmISuPlCiRDTSmDtYlO15SZYBJ1jaAlYbOIE4FhddeIBBvGNIskhepacGqlED7SV1CE+dtJE6MTH/7//////RQOAAFNywEXyOE5BCXjFQhk5pqlTbK5LtIoacyohKGz5QLa6VKT1BKAmStbVGj2JncVApIMd+nHUJvXj7bp8qJSox9kNz53+StzsgLm6emaoks9FKcyO2oE62YT/+5Jk7o7kVFBTm09DYj/EajM9hVyPjMNObTzPgOwMqQz0mWBS3O2nktW7U0NJ2Vf+RX/1P+MO51J/5v15VinUihD/fbNoAABByQlaVnkWjNVCvaVIMUAY9pVMymqcICYVGThwVeR5n4HxIhTIW05e4Dw0rn/o7pd7LiJX3aPmKP6Xf///11AAAFyveYIkHxARjRocINmXhJiwSX4CwUkCX7MRIQVIDKB/R764VZbDSO5KCrOdJi3BAT+GIP1lUT8ehHBAgiUU9N0nLUr12UYcx+Ku6dHiOmifJYaCkFZ0iohEXC2cKNcEuo5IYRv+6+Whaidk54rkidP0e6YNzwiuO/98zx+Sf+yv87dr9ZBUAiK6LZRlmkS9OsaJUCbQRruTFQMCEDKTQNUm8QgorYyeOsMEVqKJo8uCrSkz2HiBpwHdQ6j/M7//////nLEAAFNxjJD4VKzHABTZlEiS6qDcndYqNCp5xxM+2/cMwFPy2JsImGlYEZeNY6oYlqUhKOR4KojK4C0WT98PwCvRV5S3AyFJqhschC67JlKnGhVd4u4X//uSZOyIo+ZD1bsvMvZA5HpDPSVcEPzbTG29C8j5DKlc8yWK7ef/35Ut/WkvZUslcUuWx8fRpv+vGbTXMsY1din1+zPvy/Xyv6Z5dnrP85RXoAALEHXYqE4FZKF6oy+tKqK4oIzU3IFSp6hUBaNUUJNkrQ+w2QnZNy9ooY2LAx1+jWEGpIyDvYlKcpp0f////zBV/SVMbGCuPMFCjPQlWFXKVIwFvPBIyBcQYh7gzmmQ3nqnXQjZ54U5gImjIni4uaGKIjDcx6RL2FFZmM1idUxRws9sjyljZ6HaZaI2cQNIJWaeMsEoDdQNWxrJVkmwWSZc53TRHB88AHmHh6VCCxQBQiQcNlbsEK6EgFaer1rN44ILMb+EEpF5g2+ETLe0xeLoIpVrl4b7NL1IcgLrLNs/DPgH6/////5pAQAACm4SgQEBOaQMQNMUOQYCA6zUBalgkKBTBv0ZoHhly1MVN5uWRduI82bC8KEgB8+FYbi5PM6lG7UFHqhnTk0dwlJO4uTarIU1aB2fiKisHhsDJHDZHzQYO677EyMYehLxeTNV2f/7kmTpjmQTVlSbLDS2QIPKYz0lXI3kl1JtvMvA5wwp9BekKOPGLKU8rw/pvNRTip6TR1xNa31HfzGR639yVu46/qy9hMCQAAUKIIUI2h9EmLkEYIMdybLiHOFXBIuRkBU+cRzIAVE6wGjGwXaRCJuBBKE98ZaIuAApDwgWFiS7JFCK/ndn/////WC7SU6bFoQBjJtDqARGVAhIwgEwI4CD0kUi0Th0E/z9xtqKXkcfqBU9Qgkz9330GgqY7LX6Xsx5/n1aIumiichh1/ZVQRuH0Eip4fvTUf7WjqiwgJQSPoklW55NMSNXcjc52y/GBDk0M0pkuvNdEUjvtsvUSRnrlKb9k+EQQJj1OXpfkharplWGHFUOQ8ZMiQE2PQ6jQHGVrWVDsYeoJ4HaOkJWbAhWlcBCGjCn+5c4xoIcRSNgcBPGNQum7J2f5H////9yAAALlEScwhk9bEzh4w5lOAxwEsGGtmARWIBAbnHo6yqUNTCwX3aw9EHuyxh2WvIZM7oJZHoGfRfKZzbPIBkCkwWbLmQwDgrcWRJGVTTDSAUIsJf/+5Jk8orkTE3Tu09EtkPjGkM9JloQ/SVIbSRaSPGMKQz0mZhVlGEw0cY6a2vk2zJFuuUcCwqgD1HgbPtUhio0nJBUFpNtSxw4RHiNTQEz2MAAkAAADbjMMLdTiwj/OZVHI1m0jI5IkMDWC4wfp65qCBbG/Wm38pnuCtKvLiBJA8OIjgtQlInFX+lP//Qn///7SA2FgTMOfTm0gxSLMEbgQRpcDQuGD40CF+gaFo/mBgcbV9AD6IVJiMjnDzNYThrKIHEKWqjtOM50cacd2S+AiVAglrTw7hGR+KCGzSPtOY0kOAcFR8SIzmPdhyLHPNMcw10Rml1uCPmcq6nt/ToZKnik2JAVU8uJEqNXqLPMqsW3WRMUGHqccQV4fK0qEm2NY/jQIDgXeojPICpCCUdC1KsSkw4w/UXhSXuIFjzdw4DhQYQcgMdfV//07P//+2oAAAKghCSA3NGNjU381JTIz0WFFihwsBotS0wwXWHGkpd6xHqUpYy/a54HFANg8MMmao3y05Qp2tRc8RuoVt+ie/rkRBwIfoJc3JTFl+d55HQv//uSZOiOo/wq0htYSfBBowpKPYNoECzbRk29EQDvDCjM9Jlg2YgWtoKFVCDERaVMoiR8loGKxI/CbCkYgikxhBaIx/y4N/+98sj2vvqdBX/hbnenpXN1yMMW43MtY71CAAm0QAgW4MEYRkVHVKXN8w0B7hsDnIkbg1ba0ysdm/6/p/Z2odZNv1/7L//b//9Kl/////7dGqrnVGI45MoIAplcZ9lJyl5wlhkEQ88MMsWOwYKgTChFUURYHTffdtpp9Is/y+ZuietnEKhiHpl3aiJbwDQt4QBoEJUgWMyaSitGM3WitHKTUK6du7DccNr0ek4Vn8rdhYwpHjgzmZfnD+Xd+L/fPqU2e+VyU//n+CKpgJbhLYvWHYE52rB84GgfR6MhzLQ7ZLSC5TmsC9gK/vUY1sdtL4tw3rTToe1mv+j////oqxxIYqoAAeEAPM+Gk5CBDWYVNDhwxMbTLALMMmQBBExeMjIQvMcBEZgaElxhgzT0aS9qFbcHmZwGFEjNnYMlYOlJiv2aQJRhYFpNCfFqPa7TGGsuC2zS3OL9Mkdppv/7kmToDhRpTdEbaR6SPUq6/T0iH49RI0ptMHaAxYvphMMJosvg6FxSJDiAFgRD81Gi40tNWY+RG8LkkJoX2feK4NEabfUnR6VwyMvk9+xUxBQLJ1c3m28FTFb+//fj2h/UP719360AQAACuj2jFZ1tNeikfZi/qyYFVErffGiN4rIkp5CpflpD1+mPqFjlT5CFaYMFG+rUFp52Gvsd/d/0f/9YToIQSM5j3x0gZhGxolY8CEL0yBQMMrtU1BS1ritc+yh/W5NAd5TRR0WLN1eyHASBe5t09QdAmOIDh2CQPUJs6WaZggDw6DmVWThYPy9dX1/j47kdYqsdVMk/rrYKzHDZwePM+iIvdrLa8TUiyWKNGzEvWh0clSbVXRa0Ob4raNbE3fooAoAAAJjoXB5pxMrtQLtWxkAEdQkeTOc5PJmHvQJ8hIow8CG10W/Z3yFtH/d/v//U+Z/HPAsAAl3+RAUEHoTP/zWIi7qQZe13FYGHMvTiZ3Flz17XJ6A4RLWBRGMnAmFEjjyeBSShIQUMd0LDBR1WgjcMj1nHGGPEmoD/+5Jk644E4TZPk5hK8jyDyjdhhVoQfTdEbTC1CNWHaejzCZIomM8NnMOiVDZzYsSCpNv887WfMrfz+ciY7yY47ttUqFrg0T56c+pcvft004OASUpsMaQLWU8i7+XBVoOa8ebxSphCaA1OKbaLwAghP+df//qft/+1NFf0/0////0fm+7c/RjqEQnfioHiEGNxHRmLDPQtSFg8FAxgQirtfpjQySAfA6g/FI4RTlRJpEZHkdrMfhKEe5GedDGuC7DCS6iQ6MujaiPRlC2HJENAvxY4+YS+FlZaEsty1zEGD3KIU8E5/N4B55dov+zO+Yuvt0l/H/t7bX/cvczxmNmd9uNfHxvopykUGZOTat2SRpXHfwOAAAYr0tJ92OjYpU87B38YntiBGRCcVtOkk/BppcTj/XZ1WeOgafEAWBsCLED4uS3yji9W3+9im////0+MoQDJBqYAM4He4Fn5hssmlReuMCgEyaQSYPGBhMDTwAgcFyMs0AtxoFAJJJJQ8QAiGcS8gIWOQFmSuJHrqXUnWTCJmKMBj5KqUBRBnLTmDuso//uSZOGKA4kpUxtMHLI4qrqnPCJ+kXE/SO28y8j2CaiNhJlY4reF8iZ1kAkIu9GhgyxIvK5c116r3wu1Pzb9RmMBLROAoDwJiRRIo4SuLjBUwUJiYEZ0z4Lii6lut7gyeqnut+bhOJlP5/+U9NJ6hWpXmCGLp+fbaTQAAqGrDBGg7ga1zTQl0yHTcEaBqfnr5IQYZmImV6fudEjZ/pqcGVF7SmviBGitz/Z/3/////ul7ACoBR0x09MRSDG186RaMXIBkSJCgwIwT/QngAhMGElgBYoMCFlJ4IgpWvwzokeqNFgwsqAhyIaQQkgcIGWQkCJLXmKBN6Zpb8uc3ZnJFIRuEEVY4WuwlM4DL5TAChOMAMIg6Zpnnf5ktikPUt8HST6UjSZUPjBVA8V7utqdT51YdQ5vTqJnsvqZtH5mHxlVf3Hfpcw0x3zXPNXcMNop64LxACQJgIIKbFjQo6FiAEgQwFQAutBjImAGGma0w9Njjg9cHEparb9f6L/9X////3VaVQAAC3xGbN7yNgtD8Bt4YCQGcuAREBghjCgGPmlCLv/7kmTnDgUvT88LmUN2OCM6QxnpAhQhWUBt4Q3IwQdrdGYNwtLAteqFTNVOiAJG2sLVIAbSE3GeOShitBQ54GvBUCmpWcMdGK3TrccI1WfiWIgBwtVGBc1B3kgLuQlJBU8n2KBEHkmmEMbLh5tttFRzJq4KVetHNlBBlF9k4SiNGyjkojs5wKVhnSYIlId6X8vEhhf7cn7f/NKRHSSgIIACVhhkpYXC6Y8jBQORL5dyCKYgUdRol0rKh9zpaDpL+2zc3zFP6zpXJFSP///5FIBUBhKZSNmkCxv7UYvJmkDRjqcZMJmHBoNCAKGsWQeIQ1S96GcOoQjLGEJ8MJKMrUcdyyDiJeb3wCyRdawKPjcmwoXvzO8gOUzc+qgWvYFE4OeR+dWZaZE6NsB5RD5EbZksiplRsKt5O2ENRSIEEYtVWFmfabH0YuHGJNSfqS9XT50MMnGMzB4D1pU/VXJKdAsWo0yWEtVwhqzEXnb8aLOp4zsFxIfBAtmbDptC2O9TiAb9ygvYYKEl3XyP9aoAALHBUzFjNjWSMAM7LhLUEA0ckbn/+5Bkzg6Uy1dRm0keoi/C+rMswxqR8QNGbaR6gLYMKhQnmDCDhQsGFtwwKSgMYR/kd2dAwIx7GilxI4SMGCOsyQOsYlqu3aZgsETAL3UsaQtsLgRjBh6v3sijpxIeCZFFYSveSQ08t0IC8bAAKsHlH6QdkQnl4tZ4ltPEDPXL23a8c2q3WtPRMXzYaTP12s93blJ21fz9ixbE8CKFc+J2EitwaQ62aFkQ6ABSoAxASySPNp6w/wjy1NDA8EDXCUbkMFz3gNyQEqcdPBA5EXcptl4iPT3nvk/8uAHFhAYnHMnhStH5S5wAamWdUiGQAZjwWEJo0yg5EAoYUAChjBkmzThtoQ0BtqOig0LoqxVfIgJi5SbsOLCl02lrcR5Tdcedf1uauW3iD+sBGhRka1Z2GVdNah2bTwuYKXtygipItUNzSyElQruJRITIkTBOw04UKS1DkFvOWyWsrsG1Es2s6TPv1L7d3am3ZVeFZudiodZ1Nu/KAEEBAKcGEnXikrri+ipCcE+BNQ6zA5LsT8wOujuhjRAA54KFH36381/68x//+5JkyQ4Eyz1Qk3li8DFCuqc9I1aTaS9AbaRcSMaI6ujHlcLq////2toABsCwMNEzkBCwygYDJYIBSQMJB0zoLDGQbEieinDwOKocF1KEdIJR7PMgVBbox5S5HJzFBkDwqgLAJ1OKshe9Gra9yy3UaBHX1aLDtxsT7I1KgZbKqzBnWiUbVhxjCdLY3plcRsSuGfIgeEbSeIGipmnxcXQtH2d3dlJSUKtmKSvj6jlZccu8yf88++naCPfozpXA8nmJ+ub266CoABTsHZDjgCao0aJ+vmOyMAuY0wTkf6FxpZoTNjJHC3GkAlFQ0uNq913cz/+r1C24h//+gFUIzCB/NsFQsOGnzI8WkgkZ8ig5BAzEoAPDLHBAOtYGQCVLdGQlxV3N+OgKAhMCgl6TTeNOgtibjrrftja/V2yHHOKxiLxiUKlgOX2qOZrW7yxDQ+TQRsWKE4nS0I205llDefAYMBGxDPzOzs6up1UxqO2ysis0/etvod/ZmRlQDJvBStVL66+gAXwEWaKkJkrmDqdaLiIzx0CTiFsbCwpIvctwFOpA//uSZLwOBOU/T5OZS3Iz4jpjPSU6kSEvQm2kWkjGhWskkyTOc72v8Udfz3KD0Pa59f93f//+5NUAiAcMTYjgHY2A7MWSTWAQQOBqF6AmQHBpmAUUBg6KWiyje5LlljLVQoAVMhS4vhuLHWbg4DaB3y3Ra0uAmKOKaaiCpa9zpOwnS/rbPt6vnXbi30Hb1EpIEqUujFbaNRj5IgibJbZqcpltlSyAxcdUlZdsDtKqFFFt6xw6x9YYm7/PVq5a8ESVgF81Nyswnw1b/BEivCzNnSwAggCEk3QvCdi9DR3L9rOhkTx9U8qoPghXcBXMmFKaqz4dPtsSnk/3aU/+z//qMoSvFgC4MDQMCDEGIiYTYLwW4TIhYOmQEPo7GAhBlAeBQcvspNAKpFKF63ETKcRN9IEUAS/rRC19ZEiAASAgkHR1ZPA8JKchzCyJ5pOtQmKVLOh0rPOuXSrLWrErm5SvWHG3FiwyeB49Yj5zh3iqzUq7046jZ1elKf1lM6xNKksGpnWpkfybklu2fe+RxDO1qaw5Wy4HV9rDtCgd9AApKwWOR//7kmS1DgTFOc6LeGL2MmGKmj2GCJMdWUBtvHcIuwZqDMSMmsbDeELvkdEoIMbYV4EJmoGS4kA4Bskbfd63htD2vH+i37P3BJP/+nySAAGyqUS+OE0GFB2jxTIMphMsQQCAYCDDwXHweMg3VLuui7IMYto0xZlw9IGul0Dk0BHRAs6mM9RlMbgZxol2P544xkOWiykh1ez7jq2ddOcTDFf5xNmgQElUKrYcSpdQyU7VJX/1PPyheX+ZF8mS7rMy//8jPyYrNida2cV8l+v9BghASABHfxizCSVqazM/VIiqMD9ajKJOB/Qk0ebIHxGNOKc6xN9G/LHAADUso59X1/yqX//1YACbu/ZEYc6AVRxRhtQKZoIOohqSW44wNCpBM4bONBRG4MVVyaJjz50dl+ofHVR1DixgUhKVEKHa5eImsq6zl3eQOJBpPQnct3POTSVl4SfSqmS3w2HcmyWTuGQjL9mH+G1N38yr6llt0zYioee0e0tbbbxuU37V8nx17oIe3UQWYACVYxI3mMhgzHpKMKD4WAgJEDwQEDIqYoTUWVf/+5JkqoiEJVdRE08b5jKBinM9hiYQHUFO7TDNiNEJaZz0jKow/HKuLrhKyaYUftIdNyuz//2Js///+moABgAAQVNl3AkUeqEac2Z0YUXx1KBSUAiMSmGEB5p8mvsPhbZlr7o8Zc7sNROPr4hyL1WQrUqx2rBQlnxRPDSh4tgIYpKDfvNR4ls1z0bfnM3k1U9O0a3H8g2SyuQcFWmDdqoRTQwR9yMiOLQ5cbdbYXvA4SpDBZaVucP7J/wrkAADAABK+4gXkokH56BiNYtHwTxmUoxHUtCbQAInkIUZhDRmQEB/d/fZ7//+qf///9RAAAAqbxkyeABawPKRjgQQBRg4EAkpeqXi5AuCwKhJV2X4ZtBTgVn4dhn9eUwW381BUMQ9Aswuqlfx4aWjl8JrTNWHImkXC3RkcMXWtxeVj4k1O2UQtP3RBS5tcD/e0L7k32CowvbrO5hzypz92RJ5viKT5jzkOK+XC+TPdR96IwrJQ2AzhiSN+yEACSbthY4RCYiUZVUw8ySaITreyUHSKECLSRDlz6bS/G6r9ynf//Jp//zi//uSZLMIhAA90lNMHaIw4fpqLYMMESUzSU2YeojEhqqoVJgKtswrMwvVQFJQAJJy5gCDhXIzQRPcduSfLN4yjm/je1qcKQ22A0WVDIbWuVKsZZHjfCi5cIkupJ9OE2KsZ3IVHQLNq926pNsxn7U4qpKs7I0xbLzuKksmTBNP7tQp0dpyl6Gj8oB19FiGvUPysRVfOHdSv0hcZf/fGKESaISl7/Ybq+ydS+5Sa3TzcwbhOxL0sQUVL1Bm3qg4carCklma6JI9Ie0AAhBKggICXdCjKbQONvlCIUlQOBHBFr6D7jjCf/m9Tf//9TU/ie++c/Z1IEAAAALqjxomGeSc6bDjhdC0Y0oxZJtio4WGCATD1O3h/nQXcnyEMCVYICvFGPGCY5qHQojmJbhRMLIwmYzLhkH2TsuJbyaKghDGyp8Uv1A30BIPQQUmIFNN6iiN7K9Yiuq3FZinpIJPrMl8/phj3s8ldKQ+UTf83RDL3f/o5KT/vGnSG9eZeHN/+IgEIUEEpyWWKJhNh8ezw/rhEV8GXEGasfoSQjwTbQ4Mxub1av/7kmS8AAT7V9XTD2N2K4GK+gwicJE0505svSvI0Yqr6DMMmmauhq//e2N7d3f/IfN0PKOeAEIAAABJ16goIuUIgCMTTBWcJeVcUnS8RAOEsYxC6ts4nUKL3z4jSRF4YqnepZTOjeVM8dxbEqj4jI6SMJwIGqWotyMzUcVbF2JBQSJUO5NHujEutxUQRffcDWSn7xKb4SOxwyxpFri5PtFCgyLrvuUX6ifik0aHe7eIo++ahqvF1XfyiUD4z/sCFQAACgAAAABgMDUDyy3ed1Ot7ubRMLC9KTDVFdZxmWcj0/////////7x40QAIEAClY0ZZxhDtxOoMqMCBUaNRRZy0t+YZEY5QHB81IGeRYWIe9TKFlQ4oT1HS8cUCWaeHAdLHtXnshZoNiseQBYEUJ28birRa+7gNS/JtcwDpZt1xfMrz3i2Xp6U1EkL8WQvB3EOhL9hfYam/mWafK45PwBE3y/D4KW5B3k64Qn75nuAwJAAVoQErdq94HUBAHDae1EQPtHFOJIo7zvKPZfSb2//V1nVa9Wn6v///////+oXKBv/+5JktoIkVVjWUw9C9izh2v0hI1SQeP1U7LxxiMcNKxxnpUIEAAABLqhgrIb5Zl7DXIA8GFSJVoq2XRXw2qHUifahH2/XLEExpfTw1eguBTLbQZbM41x04FYi996cu8XOyadlkWGovkhbGXDgtOsJLOOc+tJg/OQ++dnKvmKkmFG3TNYhJGYq1ekcw+vy//KN9WsVI6IWf6z/nKX0WBKQShMIVq1IOsAkgAUAKzBj0IbfnlWAq0ryeOtUXcabZLjtZO1QNjQYT8GDrg8p6b7Nh9h3od///////6gCgOhOYUSJZDFCIfjblDAja3GzXrLuKTBgKtcPEV0fcOMNtKhwuUxlvIfXSo8bRIGHitJC555hEChE+qwtNdfwHGzsIgddO3yHn9Al1ZvU7qh4QMpgWtaeuL+w8DY5w+KQInSsfQw8ylnmYqILYWq12emsfI4R8ZfRLUttjA7T24Ga1bFRKfQTHLX9DjnlYpP+UXnxdTkbQQAAaSEiAQBKMKhgwul5SA3TugBRYoqDF471icCoIuRdQsBNKhcNHK+vskev//////uSZL8GBBxI1LssHiA2IqrXGetCkqFfTmy9GEDPiqx0V51O///8BLoABfJUIQBRhA6IkABVRgFyYC4jyqimUEAOEwSMA4AERIGISmj+BAy3SGAICq/f1PFxVcsXMBYmnxSjdqOO2CSYoBpKpGdcheAghaSHPyBDbjwTncjtPKIrU0yukJ+z2BHvtKLzoogz1ygqGKqDitF9zSw0bwqaVU5sXC27vMx+/Rfa+vV/9qrcnf3zM7a3/f0B5DO5yb67HvaTJP7VAoAAHAD4XSrXKfOmzFErAZi+lfsgqlGGlmdfE8WF/wS+cz6CjBCuREud27e79ACcC4sZaVHGjwGVANknCIZpaSZ8OgILIlQFB5hRyOiggNAwGLlr4BQfIkullqyQ8uyKjoAt+HjDgKFNicqJPGiCi3BsTtSVe7tSqCIvFFuv+rDF7LY7lFg2t01rAjAFot2ddQ2dnmH+7f0WxmHQdFBSuce5oZ2pknPP5IpsRxltLxjsJjVkjqHDrbtoqtfxFbE+WYQ4mxUKBHoWqw/Ae6dhjOU6Shq9EbfQFLUE/f/7kmS8jiTnTNGTbzWyLkMahz0iZpG5DURtsHpAzxAowPQaSFAVx1bKCO2WgUvL2vjvMf+FZX9VAAAKlmjZlg5FzWKAgY4ZoBz+aEGjpCLKLukIwSCCzImo446iTgrRLVwFEb7ePAy0CjRIaTBbhN67JjALKbGnFNODTrXpK0ajyBOCrTvXX5hMowGDOLEW4/Sj7TjyGYOfSJ16vwuxL/tj3S0nT46GxmPUx1p2AGH+eO9pj/0eancR3bX946zvaMXAYASVaBmR42wTkHdDRSaw8SipUuhccWgOPyTe3qUs/csP9/hffGTwpx1NHwB/Q+Qb/96pQFuiAYZB6IXh0bJzyw5aMEWGlphBZMwMuBIlZckYJrPQFxBu7HIdDDK3lnv06rbJIjAVpK4mhrKSoUsa0jU2FslA/nUqG6R6gFJILwH32CQe+3ZXBQOVhe/7kpiyBtk87O7tMQ16Ww0AoDAKvFziLSbagekDjj8WWLLW5ddM4utmIAAE9wAOS1USvKAP5wSRwISf7ainAMgRDcHo+CsTPhdetgOreyR2pDnaLdj/+5JktQ6ESi1RG3hi8jRDGoc9hkaQMLVGbTDYAMqKaYxnmCgTITn7f/7MugAACpBlIcRiHvA9YfxcatmcAcbAWFg44IRpMArBg9QmBl5L6eBlywxeJqjW3WctHd/EIGPsea4mc/idaeS3n+DROXANkARScXUpqgkVdQrustFXiZgWQLQ922GbyriPm5TYnlXEHDAwBou8kowKOUMpe22u9nYsBy0a0pIAeikAAJuBKYjAEw0oZPEMPx6nlMxHVtZyaHDDxM6UeSGrL5PFpR/4FOINDnuW3p+3jm//U4l///uCwLlB0dmcAbGboJvWSZtChBSaxAGSAhMMGGj5kRwcsnNrQwAdtAMVzG7AlKjy8010wkJjfDwipJS4YMlAsOSoUNdBgCHdQl6kOi8FISSWRPuAGI7QtXxqRqHJQaw2JCw9hys3Hh5tNuIRzlpbjtW/sZPRff+Y7rrO/J+KQ408fb6Z3Plmjr2/mdRG3dPfn8avv0gAEtwSE9OIfqEDvAoJbXIADwFoU1pWizCTUerUfGhpI+v2JNcKFXb/3pTqdtrT//uSZLsOw/gtUZtMNZA2QqpTMeYYkkzXPk3hi4jWCumM9iCS/9qf//9SNVUAAAyCADAjQENZl3EYARG4OJqZUa8OmEBRkwUcRGKY0AtXGE9GdkS0MUrAdROBsDgx0gAhUzFYEvzBCyluI+szgOVtwW9K4IgyExSnOyYJw5GsQLKyujJJViUwRLrLVy+D3msyZd1qPYa377Up96M0m8vciiSXNxW2dcJwGgbhZZFK2NSL4e/JdfXLrDAFAAlOwWjEkK6h8aBlLnUCz9BUIGM20Ko4T9ZCy+quFFZRzou4tcnJ3fjv3+7+HFvw95r/6Sk4QABHB9llVMw2ROEwWwPKIykrYQDAKJlkPRK4/kag9iTBUgwVHVRoE0vJVJoHyCexBeibORxPb2+Ki115LnR0OJNkalgzJ1TtiGv6qTK6g6MDPQ+1HOPnJH+vIUl80U3hcLQpvNzUxcdvOxgmU2kvMmFgNNyXDwc0jtDV9TsCleaD3MtutDazdf32xIDnmlj2w2gUSq2t9W5n/u/d/P9kui0evUoDABJTtyqSVyjCYTmodv/7kmS7DoRmMFCbeGJyNUJadzEiLo49JUxssHEQzgqrtGYVkh0oOYkcxyGGGvWxKzEGuP7Y5BNiUZ2LKxoSIFkSAgARRidyGl71QJFCEGzaSkXoCSFTguvO5wuaup6jns01555hdHBQMJOxlNEnXbgKyRxpVAjukaR5M24pGTKq5VByDDJQPIHKLkc44h+j0D1xCSEPmKYkq8V5GT7SxknsyFecrE1QWDdWDMA6KqPa6cLubGwT6suU2hjcxne0woMDUz9sfwU4AFyBgACXf3dpgat35lI5ofOIt8/8p2BlP/////3CrF9X7vOXHMoD6g8zOEIAAgFu5H0RqMXFB6TFALLTREBE627MiTUgCJU07By3Jh2Yg0i7DUypWumRvLTpVyiPRqhbvF8XvdyHY60RpiOCMbDWISCUr/cuD44CLa8RHhPJx8Wx4HnSkp2FxC9yzKT7xnB6bhPy9xMwrW89W3esUJ21VHI9tar8Ku83TnJbFEfRYE83ktF2ZVoGmYM7mpVK3nicypSauPAlyhUihRbtkfIiK5xI7YTBlNqzVEj/+5JkxgiVjVzVuwl89iwi2xoYApKZVXdQ7DH62LiSqsQEoDAvIZ2KxkgTVYCfF8VMMuRwq86hsmipR/jgc5IDJDGFVgdHXsKKJl4PyNIRSV3Say6LckfwONhQ9CMPbHY93EBPT/ne4qIolBiN3roADAAAACXKIbACBi1okgYFioSE9nQdpyHiYU91209TtStr1E883KpS3dW+ec2XzUNv1AboSF17NLIJPKarvqiYfEHJoqsVjNuOjaC7X0UcsU4hO1fqhplJ+jrd3OuVlNXe+c1qKc/6gwdCVwWbVjNkqUUDFiy91QjFcOKnyOUmTKvldLO6axVmpHUchRr+MIBJxIgAkpS6U9qF6EnPcP04VB84+gFgG1Qcbip+uHwRJneLIqtid/9Gy///f/f+d6hvkaAlgBmiMIARDYFTAFURwLhDZU/BGGYVifyPWm9DiugkfTxF/pW5LmhwC+a7KBgjWo2wOD0QCIcTgNpdNA9lwmPk21BoOtSibltJEDHcYT+to6rhrpTORzOUlVQrx2MSIw46jUJgREidGTd7LbUBYlkB//uSZJmKBHdYVlMMHqIz4RtNBYwUkjEpVCw82lDFEuw8Mo6YJ17UXbRb5Xmi2CvmG18uc37rv5n/96w6lqEPikfGCAuAZAAEDAAAABBUDm8IHrvkGQtLmmXEFiyhFKeFiyT1WE3HkuXm/fvDSZjChRpR/kfd/ppECAAAC9MolEVTqZvwjagOWIw9SLWFKobaTQRmvToXPlTWpRGs6W41pU0qswZDkBwU08sEXCboVZYGZiViLGuX9xy9va8Uit3yTAuAqaKlWLALCxAFCltaOPoUq3iu1tb6u3aqQYp98dWV/+Y4NLaGMWiMhRyv6ms7ZHnz9YC/Uu//+ZmIBMEAIhTge+gI0iLM2Uz51Ydhb3dKsgnpW5BT1biPPIpN6J79Kl/q/tVv//RQf//xNAzrHgM3M/SRNoRzG2aChTJFHjEAaqqi4XFWuko9sHw+tBGd+VyQZKKWvRrSMp0iJUxdD34lawjhgUJYSklTuutRTGLKQ4dk8jtx6I4zz1rhileNXMJl8eL9gex9+MS7LTT4Z7ll/KonY06xZGpiimvlIsDiVv/7kmSVggQaPNdLD0WSNaerPSRNeNKZY1JMoF5YxI5rCGQVMMWOq5z87rX1dxmWoUgtrej/cjFrylZ7a0NdSqyHBiR835B4AMgyrC8TDMWFmAWeknbkyNG3csuFSUt7JGgOUsOB7YIgcxW8wrxKIes0vIli393+RgAAAnBkmVqSVYZS2EEB0MMGZQykelIbFCBEaRMcVbjHElnaZBDb9MsbE6MOGDIOi5MYlVvBw3cFSaVucTY0s+vS24gnQ61jV1471A0Vi9Pul/enQf9iVzlOR9UQJuW3LIckFK7qRrtznVxNN0Kjqr7pLbMNupJ1nX2y7YPC89bn1UPv7VTmavwz9UEzPQymKSqL4RcAgBiQHEgK0nFDzZ19hKVOa7YcFrn/mwFi1aN6gunli6805++n9JL/ZVT0EJ3+Q891AEwhVzGz46I7ONVjJyExAKBQak2k4PMRfADHwkJl5UgFPuMmAY8EuywZertBwC6TAJQZINwhRhrubptEQpdIwYJa248ZjzWovNxIgFkBLjNglWLAG9lrDXctXKTdnbtp+kQDTW//+5JklQ4EoFzUG0svMDElSuolB04U6XNIbax+QVIuaqjxNrspuGpiltx9Z9FLLU3uoyFbMji8UubnbqZLZeKYExzua4UN2S3b8VyGkbIcj4ZdV0KT8ieQvjln/9BXXySmggci/BDgI0AAAAV90+pD3ozHua8OyOL+sIlbKBHH4eFrX/+5E7WHFupHCpwmqDO+2EL/k/0dfw3//1t+pG/sv//////8QcB2CZjBkqPIuoGBJpkoRkkPOkIRAgAACnuFkplkRgTYahMsALOFvWPLEakoKt1zkQX1VjEZ47pS2oxiVtFMiQTy7STq0NdNreaQ/uxLzHGcnM3hRR66njzXyUOV5vYORMtzZA7GiwLp+u1GHPBUVEa06rSsAiH4mRE5iIESvqeqXt+75J/0uu2n8fUms10Ma+LlbTx45t44eGFVACklLYim3ABchMhRhuwMQ8YQEyjNzYVUfvv35x/9CX6In+PFzX9Hb//whB6MfmlRjrALqnjsD809gNtCwNBgIOMKAWdtyAISjkgiFEWJsXcEfw/0qYaAbGgmEiZBEFsV//uSZHOKBDpYVLtPQ2IxRxuNBSdzkCD1TG29C8DLC+qowIqKhfbtJ6FuVhhl3Vqnjt69A0aY5G1Y0yMtYUc2XPgo22NDuqKY6RQGoAF2HEEF0WTjYqJylqJinayaZq7qKX56unO6VJmSYQXtPtJtSH2j9wKOGpAASEAAFORDDi5NKsZ1SfdQ2zi32sVyJdzPnmQ6lUyzayCJLFDOyz/9D9f+r/r///8tUhUADAAAACrSxYMMGNicHQgTPiEQmu24CJ4MAJF2PuGiayCVNrAkPKUOnhVtwfKASRBshlgx8xuTR5XLzlUBAvoZoiHgkoS9ecRruRTzeHLXU+LL1avZ4fl6E1Smy4BGJBRWU162vjy1S/TL/aDOjVd2v//drOV3AC8UpMTp7gtyvpEfQBKQABSPttUfHrYWYmET90LJ7G29dVrXrCwodtANlbuv8kH5Lu/0/5YC////ihJIBeGT4Rn5M0GZKZYDxcFAI+RFSEou6aCIUiViSHsIwuTLHeV9fby1A65VevgFmU84+y57Z92mDNvBr7VsmQo5w9KKILB0MP/7kmR8CgQSUVPTLB1CL2HKyiXlVJCAzUpt5SnA1Y4pAPSY+Muw2HWCASlDLlSxuCQ6s9FUapuMAVZKwk8RMwtqtzTUWt91HcTkZLyAuqtB4NJWgKa7lHA0fJD3uRYKuTEnP0apLWVENxqisbEANkhR4Z5calWHTkCAUAqHIArSngqIxrmg5XfBMM30yObDXLk70iD2f5MAAAu0KhRvpOtI0UYMPKRsEAxOBh5s5bIIbjDQ1zFK01l6vk7ymD+FrmKQEn3DaM8dIAxXzBGVTEifqHHTX8z+PUS8VqSGPM9CgsUY1JtFJEEUCHIHjA+TIyhhj6qWkTbOt3Oe5SjxMkY2zPmIUJ+zbzgWmWLVWX9erfGtP4T/8DbHUCvNn0AACsBg+lkchPIpiTbh8YiTEbOBEo3609sCyEmwWrtjAsa6IL3ZRLn3WHGB32qV9/+//sclAAApyVfbU1VHMHBE5VAFLognLL1csTWw/TF5qwbLwBTVabksCBcE0murm19iUhW88gHBmvxk0oMx9d7n4/hm9u/0gSQZ2ov//K7YBq7PL3v/+5JkhYCEMzVSm2keIjPDemMwwmoOjP9W7DDPGMCFapxhGQI/5KCjHqGi7vo7jFRrvpbLRKB+5qwU5MMGBR6vFHK//nLT8xIASVXQxIPIoZlskL4W1oYqRTIIEQmdeAqnhAFjFgFd/c1vf/g2BAQdE4EOZf/6PLoAAAFwGNnj8bPocYlOAAAIUu5BRcJvHChUNqVJXoAo5AaQjqp1qbgoOJPM1PISpiUSibtwwpujjFl7vK7NIhOoJmNJVvi0dh7lP6/Dp36sTBsGKtccJnrsI1fAgpPpusPk3GQrHJEqfJeGTp7MnTymV18/LhAGdkYi5zjnMzVckTF89c1Z6EI1TkAigIRWuxlEmIivRufaPMWBQBBBl3Gs+D5LOYgsmgC1vusVd3uhY//sbLx8pbA+OHWGkpr8QN/fq+yj2d//qV7v6QC6xk8BkybgHHDAHSLSW5XKgUYsCOCTqu0w0yGxhgV+46yGEMgBpJkNMngZQLamFdUr9LTgtEYvwzJ2449r+L4R4Ya8NlSo6hlMIpD9R1Oz74whfZfxrkdy1LIYsw/L//uSZJUOBMtXUZssLqAxowqnIMg4F+FxSG1lL8C4jCt0wSWoGRDQkiuSmTxjtiWsZiMAt8TgQsHUgYMKimwHAQgY8PutNyXbBOcyjiqrBc0dswu3riB/UKIELcUk20aCFBdHO/KRQ6fBhYxJia8TM6u1BQjFb4NyRpA4CrSzC7beL6kYABYoAAAAAA+1o5mvS0UGxmasm/LdQz2k6r/RGVVggpbiT7vaa///////5Rl7SFVCCBQAAApWRogkbUGBxZRwCDTxSOkjMzk5FJaEShcsg2T9k7XXgUlLH4pmqzUaw3UgYkYz1rcD424XCnyd6C39XMp6Oz1HY5L13o0KE0fOE+kpm5CAOhIlN2hLtAubXPpgsSKX45qnTD4b2dTcqG+onfflSQso7/17m1dImBZMm/kkNUmh89qkDzQVSRrdm/dSalp/9TyaB6jb+56AKYQCm7VXPW05CFKFJv7ERk/yBh/IEiNDmXmymojeiwYFdmlC7q93JnWdYDAwAHIcOFCBKwYX6q5N1tHQJgxofE6i83ff+9JYxAj+X74ZOpM3U//7kmR3ggTiWNVTCTaiLEMK1DDFaBGFX1bsJHyA1Q7s/PYVOJG5S25cm44h8+0w0PdWtK6GAIijuawv/lnS7znb2e46xS3zKvWhGqQTCwADDUUDcdPYkaAOVnilZGU1mQ9WbuZJXIHalHcUv/pQ2uuRLIS/l/G2X96CciQM7rf80aPC862HHD2knxggAak7PhogAMJZ7x8RqZzKaDf+zP5siswo+0Co/N5N5aLcD0WKkNLq1RP/agJehT2MbQZWAMkAGdHm1BIdDgSBwiIwKDNsOGoUmUUr2nG3SsnWwxWYcvBnocMg+Qx9GZdjOpq07kSLpiTARBlCreN6RUMEygcDnUZNLe7OAMezTgElYbi9RecSw0OaHCOujeLQ3FYYD6HXcPxxHHbjH1rdNU75zxPSlc7ME4fof5XVzkOprz96D1qv+qoaN+LlrOLdBtfHOtFKO6mP3mhoSAIAAQAAQQBPnEGRsQ4ZrS94L0pbOSNLF6GEcChd7/UeaNzmpAAOf8djww7dG+lPzzi5F/Aqf//////w4lwFrSBw0DFFWnZiDRn/+5JkcY4EzVfUC09Gpj1FSt09Zz6TEV9OTT0agM2L7fS3lgYxIV2HfDA0iMa2ae/znLHpGew3cjU+2EcBw9GOhVKyWmks9TxxJEi0GBAMml0boI0/i5onNiwIDDKPtBR3O04/72JehJ9ZqpISA8aU60CXJPSPNYmtfgr21ipvVvjPleWtuWmYWKsHx5pkYrHeIVcwO/+BkRz8/yT93KpRFu8TVfdcw181XzJQgGlrsfWHAW6wgCCXOjVKZbJIBrZcb+RPdWVA9L984sGN8itzuhIsc9DfY1nDrv9qf6P//9X0aKaBBRAAAgnHeBKQ8qjiDO03KigUcY8s9QFXtemYdTxVt88adhKM0ejU6oRL6vL2qgyKGAwy+eduxlhzsZQhhuxj9/fyUkZJsUb9HAO7v30PcH2R335pvoRCD8RXNzspVQJ6Bj201I8PXL/6hwD6NgwIdHo9VKR3bQIkK7nq7aLcPsWVNClERgeHnsSpCFPZkAAXUfhiaDKAhhjTrFdICSUSVZEdbcJt+xX/qCr/6p///w6a5Dy38993///pAgCr//uSZF8CBFNY1dMsLqQwpSsNDeVkEJVHTuyw+kjVB2x01L0aXYBIw9OkOcCEYEiGriACINSEarbS2HndqO0pZFoDlLwsobWajpZaGp6apK8bX6iQw5x5VlEZrGOUbdkZWxX8Llbu4mSVDZy/Lu+DNmNLRINJNQwk+23nlwORJayocpxL9Xd6jXZa/OdI2omopHV/z2m9zDXYcpRzGNMQq2ZN/Ddb4jUE4rAiSpNVvTBoB1JbHgHRs6S6KhTk9D7A/RESshcJbjHlQEKsFfRpyvxv/9GuM5L//6vVEwQACk5BhatPImMH+RdFkOu14WqzARSUUd+Yak7Evks86FO8aBcZxlThv7Wo5p93bZ4nzRj0YQCM5QmDQLanvs0iRK1LNFpf2eIy0Ja6idThYWWIn7okZC/q19KFvTbaN6mJ50isIy99OZlYeW7mOMpS9/oiG6/AioBpYBQAJuFgcNJxyJtJusnYgmzB5mgMsk3sTLPZ2b3Y3Ac9RWHNbMUlPaKN9dHT9HR/35Z///xEAAATY8QlQeoPhj4MIXcQOVQDGkRDfP/7kmRjgAPLUlS7CB3WN4MKqg3mGpChS0xsJHjIyQwppPSZUFQlR283Z04is6op3IYBgCVv+4YcBmcNW4cjbWwce/LHgdFX8siDXHgionDIRIlBIZEFFCXiFkor5SbSew0XNSJ2qUthOVjZYrnTyoTqN+vsrlOZZlkxeUVp/odcr7/vnpfsGNyFOWeSEaqKTnOzY4AAAABgQReKJYa9WnXaPVRv7Jyl2E9qIGNyOkGTK3MFR+3MDbvTsiLUCZZa5yp1XX/1qgAIAAAALtjxdNCwltMXg5iyoA+wKBjb8ooSxhM7JJTUZJfgyBobKBYCpZWgGux7DONQ+oewZtCyyaWEEsuoYQiksKpjaR1Oz9+CyWi21a9XLlWD2o487MeeBCypWsyM1FQ2VXI39qvUS+xtOmjsUPPl4AZFYO3QhHO2/fQAA4QAAABwBlR0MyP3a4N06PhHn+4MKcwrMv5BoVKG3ir3lHh30fGxy3pRj9xU5WpRV9+r/kSAAAKd3qJlIboPEVoeGpk0gSqS6cJs48VLBNFXIet4UTyw1GKNFLCtt9L/+5Bkbggj3kZUUywVsjYDCm0x6EYOnRdVTLyryMaQqQTBiwAdG9Qu6PIHeKZRTdPD/Ut94tC3UUZw+5WUwkZ2ceHEK7u6XoERK6CCzzUR2aUthN1b1WjyoV5q2JY6nY6GEouQyha6L7q8qZt/uKwwqCsoNn6TWDRpesS3LR84/hTVQjp/vMv0pBNoTKxOYlYYvsQoMZqn6Cc70qPJgZfjqgEIAAABd3ehMUOMFhgGI4iLKapQuM10qFZo36nI/A86BRxeXioBtOO53ysvuNF5DDomHJoaEcyL5iXXh/Li38+zPeZpYKFFia5RUCt3vfCoJyQT/vZLrDFeHPf2wX98PNMNTUHIhzQaAVFf/pKgpdRX/9aN84AHhIzjbO9CkFJBmZKgmLrtOB1yVqPQiTppeUtqTJw3U0gwSIslgpXWv7jyD+UmL9Z7//zn1hPBuwACGiCGpBHGbFhGsKsUQGVCFxLFKdjR5eAz0NBvvTsLeQUcg+EWiDnFIL+j4Macqy4GCCojEFEEqBRc+QkizKncZdqJtSpvUQMKxiqOugx98Pn/+5JkgAIjqUFUUwwbYjXDukI9KD6OnKlKbT0rSNmL6XTDJeBNW143j39/gLZWNbV4rbF/8Yj/l+yz7QOxDHsxf0VYUAAChABcAkzBgoIpYRrS7CLwRDpBNmzBWCydLnFWGLxeNrro0czefjsCBh1C3FY7Wav6P9H/9dUAAAyhsQALgAmAhhYnmRdKiCDANRDxFXxaQeBMYacytMSGkao8jWpig2ny/rIGjtQTVnZmG4k9LHS4rbQDBE5F9xt9XGghxHdiEx+VmX1AIaeoqHwURJ57I4Zc1prb4Fd3rY3xqW1/nVUYRfP891AmZocXA2+nj1oyflsa7NT+5mCAABKdCZwMiEuJUaklxQAhM0bSNJ7rLNDqCMBB5ZlakbRHoGcDhmj6NNun6/cv/63/97belQM3aIaZhurJBFYx7BByohREA6xUvEJiDiNqtTelk4Iwe5QmGOU+zmLI3QOhc12XhPlzL4bwHNCXSqbUMOcnRcC68K8to+jUSaQSjPPBVrONSHNbMJleQ548Tr3LxLM6khYLrO2bpwplGRk/+15tQuDC//uSZJOOhAI/0ZtGFqI14vpnJCOwlVV1SGy9LcCsDCsoYRpSCOUwjlm/wiJ0ZIgWA+oIhIwq9Qq+HXUyc2mNUxhAFCorDeTXadKZQUGy5piqzKXWOthcnpdv9LEdJJEgAAARzg9YNPx14KyNBSNj3N3U2aYjWurjepqyAyb//////////5wTq6kBgABJUtdja6kKzGJMeWrlbZocYXPAr0UMbZzFoGb2XRhkCQEqtUs1LNU2W6llXFHL7lunjk5EJBMCIcdl9JSU1mpP88YAX9t+Jj43YCLJ+U7/Ks7yPAy2WQweD9zhRJ4zyHGaD1Zokr+P/jVYaviX+ta387pukDV4dnlvWEs4xSLvWocOO8W8dVv3OKp3JQKjdE4qI/jRrog81YfzhpzvPAg1hTDLMhjcVwwLzJBrApFifwJdlDIsFAIBF0fUYvIePHYRBQOvnJaEBERv/3YbbK6BKwDp/ynxew/JEmev6f5v/s//0VqZAEAAAl2ogIRYTbMsQEJo6IDhMUVOkmxdtbTwwxpr0fp7LRAUOLUkrceQWq0jsU7wtP/7kmSMgAWpYVW7DH6EMsMK/SBpahPRd1jsJN5AzZRs9HabCAlEbmJa7EZrv33ExDTPjM/TXbVy6+nKd1J/vdVa9jXxOupGB6WXcwq35yUYJKqQbVVrxggJAHN3OErgxyETF3znNBl3NBV65X3LZpy22O/kxbf5df/AOjX3w8dj1+y7bK0L0GI5xCEU041kz8QUBAdAoGHJoCjJdtlC43HglR5jaH5w0e/R721PmQVUN8309epv+bWGSVrpS6jC3O6l+j+hZMQCAAAAAchgC+EscI5RQKMXZDTZUwVhJq0OqjIuWKNAcQkUk0SGSFzvCgRC6hqUJ1Aw5Q64Z1cA+iFO/SXGXiTioZPn7iQLuzuGRCjMY07opzVDvq/4iHPcOW4mY3m7q6v97e+LHBEzVG7OR6M3MXxwXxTUl2L34hUV7zq2p9Zu/d9KsKAAAC05A1R5J2GDzU2P6EuUMZWoirVs3gOFXyof9u7CxnrAj0Ysa8chN//+f/+XAtojWE12XGkAGm0Npb8pZr1AznQkFZhvyto0lmb0MDw7ud9jrOVv427/+5JkboIEG03YaelGkjCjGyoExzKQwQNaTD0aSLYMLnQEnNrGkp05maQmzSRi1Lp5/KFY4tnPk/QznJpDYCRT8KPminZq6kVp3ESvRI7Yw/epXoWF76tabLMCMA1bnRZjLAxv+qvGo+jd8fZYxc7yC35K24gfG/4J+v9wTWiqfqsAALNBAIIC7/YA0PgZGoTHyDf3MZPRf+JIZ/9Iyj///lOkHjP/7NvQWOkgqRjVAAAAFSWMUsiYBGhhLAb9hQURQTCRTZTgHh6KNZXNL3OBwLWJa2KDA9qVQ8+6C7ABpKRKes7BtLIFnJMwFEGb2HsykKwIuERG3I7RRlTikelejGghsWHaRkpem7AoEFJVYcaXxBlyUirxT4xrOIHZo0ODmLez6NCUhxWr91z9eIw+UpSnVClD4YI98pSCFdfkUtFJ6jR+vRBIphEVKyILewggCfJE2DAb/U0mgZ4K6MMXUR4EJbqLo5m1s1XLE3RbQeXxLjD+VE/5v6agzeKgA0sAGQgbQJ0JH8kesYUANIkOOLyqanfov6BHHIkX0AQroI9y//uSZHmOBQZb1JsvLrItprusNAXTlB1hTmy1fgjCnS10oAuAFeDSQsFBrtwyoESoFY86pqtWDDM3j7ZlNVUp9lGnYgGkuHccPAQrNT1hjrsO5S5rKhUqnZbciWFmxlKCwXJuwLhur9FuzAYbRpNTIxNnrPj69C+snWoNR+qj+KglHnRFpdtqAclv/83MVsq5v2Q/pjt9/tlbr3VDUClBeaEPBKShPi+AXNVKoMAOoQF+hUa3OclLVGJhb7NtpmCoNf9rZ256hvT87f6inb/BP9AAAJvVOxTovwDWAZIeZh4gMoEHIUfSFJmuEKHXOWNMl0ZXEzg/VpwsbpGkdpbvQTpldzLrKZfJa0ZrAznjXNmp6+fj1OOE5HCJSKVAGLe1Xq4KpkiE1ZnQeVWGCzs44XK6XfINeMYU7OY6E9soiTZiE3MLUoa6Fiow53yQgAABQNi1kDiM4Vq2EQBjRqJ2Ifh+egWFS9YcQrsULrFbjB1BQ0AC2snj5vRLUqWljN9Zr/1f/GAqMsEFXFYSLQOO0rARiMAUjRwAMK1uNyxdkTYYLP/7kmRojqPiUVYbDyryN2O6kzBrog+U8VJsPG/IzYwqWJelAENliKAkRmHE8waYEJYYXJ/cvwVjS0oUrUVUQJc0VoSs4poLi3OTXm+z3Wa1j7xDjyQfI2yNbdE1NX1a2FI5W55Fmq+EyKSR8uf3rBX8eC2PoFBlrOt4rdNJtHQ2a0f5IGAnkCEM0fFaFd2GyBogbeVHBZDcwWNLXaa//9B4MNSt0MROpcXYHknrnHi8y0WTyX/rZYIAAApxo7FZn5MK01B4hdEqNZC1N+CTARBxk5OdwgHicklYRi4hRj2OhYU9fx2KlPwokNUPxaIlFGTg8Y1FnVmueMVFauJjvZhofwWOnhPwFByOtzN1pPC0qlLWHA567fvfZjBBG1vKOYQSbUVayMEG4MJzWGGEuS1uux6PlKZ+eEy4AAMAGnsBPKJFLjScXNwshqUnLHSdJtxwiupW29L/g8fv1kuVQszBhn9lC5YW2Nd9H/kgCpPaSBZAISF8iVQWBK8MS0JA5fJnWiTF5M1G+4zWFUZTLaddUvq0yR6oYEbj3CYUWkcVaQv/+5JkdYIEFVHWOw9C9jLjOoMx6UCPYS9U7DEWQM+MKizMLYBNj4B7CYJQE5dMppyW5PdyPjjhvCcAxI2LpjeGD0QJ2rhvYx4+B1L2MO7+7/i5QRha+f6m3if2SOaumm9zGCxAcuR0ILDiAAHQQQGsrTFeEDhWXPrQNhgV1sYrhjjIti0ARz6qRtB5/7Rpm+m89rA7M1PebpOqrUc9KgAACnEXDDFTWl3+OCSURV8DFRdJUiURoirOpNNKjrJmIDy40N3kq0YJZem0Flg1+ww/c1HoYV440akcOvLB0AZyONt+va1NOvTT9P0auBMcaT7+1q8AYmiXdOtNYlJuc4CLrk2xMMFzUgUW1R42kqdQHyBliBioqRKyyRlC68wAABQAAAAcAHGoEmQtIS2yQ6COqY4U/ChQTn5UCQxhgqlutZHd/81uDxxvqmoaq7Mcym35dBTtfsfGGQFbDvMDXx5daytiNrDDJibpOO/Sy5r8NKRryp/WW8pKZfbP2gvQQh+aLqUwQQaqC02PKVMJIdFVpkyv7cTdmBu/P/LtplALOL9b//uSZIIKo/kyUxtJHpA0Ywp9GegYDrS9UOyw1MjBi+lEwyVybZzKBPL5F1OSQ5R2uPWFfzR7q1fg5tsW++f+5tFC533OY330CqJ8+AEJxFKo1vKLl4HBGRoSEA1goDNWgSIHSs+hAIkBV8t7jBlEDt2Tc/h1zu7/VooAABy1nphCLEC+g0wUZNRJDXMFhWugylgsMWm9oWdOOuOtUf91rtyAExllx2LMi1xTV76U/LViQkxtO+IgcOrSg/zNqmhHDtX2SWlgnCAR5SY32XSOn97zz/+x1zSxXbfCxyVACeLrDQq+mVycsYeuJJJEPKHARq88FyQ7N3hOHoolAurmDK4vToFoxwRoknCirSZzkpHHFZmz1MECrDegMPQRcC30nf/QE54gdIoZSZjgCNKAgsLEZxVanaanvL6JscLXCsRsFalbqVnW6dcjZ29kUdbFIY9Lm2lpGixpCZDYyCwSBHyY4k6cJrllFtlUFkrqIM6l8yUr8A1ZjWd6mtZmTKd57qeXVst1gjqhiPdZ9Pbu2XX99LcoQSpAwOhrtp79DEwujf/7kmSUDqOrO1QbLEWQM4MKUTDIlA6JXU5spFbIyg8pmPMd4vZCRmYrZJZkICie5BCRjoe1GVhQxVzl5nYeDRF/7yxRppVB9HL//LUAAJO2MHNiXwMCTCI2F2kgoPRBizL1fOjils6y6zwL7NElC4gxTcIIXhBPm1UHRBHSmmZNOLxXQ1dYcYN7bni0ZljxJKJi9NMaZ3J3RiOszblUw5SnvH+7fS5TgCx7qp64qeYtrmyotY0XeSZfjxaVJ1B4GAAQBi8QV9xmUIysBwCSoGi51YoH0K0tJ+w1YXUhZWeUBE9jehbofh1DW/v9QY95B7wzW5EOD42qAOXqUGII502NCMFeBww4hhi1mZjlCEDuVEIY3I1OZRhUVscxyIrHE64Xcjj2vy6yHOMqOuW1iYwoYvD9I0kt5ef+vC3+12UHkhuSDoqpSXgqQkj9UuHvfScFMjtbW5jF5nRhhHU4K67oYxFudBOdjql5vKfppV3VtM+RdTNVeJMLIAEBDVpJKaonHzUEmYUDueWHFSDIvI2DGQRBSbtp7gyIckpPi0zaXBj/+5JkqwYjljBTmw8z0DkDulYxKEoQLVlO7CS6iMwNKaDDJeBz714+ZQpfLt3XKhgAAAuboFCwWLiXSoBHGKNsyBk0bBM7N5wFpT0JlkN3YNXMymAnrdCFs9xjbJmcCWPIErtqbsj6qU8BUWapzvsmtFC9Wmu/dbLnKKW0rqDEMhZpXVVVNCUwt0UzGkd7vZbK+mx1pbRNB66GWTY6iDuqtTN7MCpklpp1XjSalC9CKAoiKipGOUbQkAnZUPYiLtKJziQHXplm0cUMGBQFaNmWsKAcsHizWDRTzigBIBACTt/UcYmlGzJH5oaaSsrDos24WQA89GwT0VpjN9ONR8ueMhRrq2TDAvOjBQYVMHJuS0AtGS7xvESIz5GZNV3LsrY9tX2X5dd8jt5u8/O+am58ZUu0MoisvJrS1j2iAy4+xoe9wBXuAJ2pSQ0WDvFZDDBRfR9gjsdXqV8Yju0L7ZWYc8a2DET1VlV17shP/7X/Dhug4J85RQAAU90PkHQAYZ8oAKBoDbAwpRQWJJgGvstdOMoOSqPKwpdNBrssIgXYrOM8//uSZLmA46NQVLsMLTI3YxpAFekIDSzTWUwwy4DGFmoMwwpQ7ULUWBLC8qLIEnR9KxNkKh3OBSCx0qRHOH7GGqBqQeY++sXZQBKz+3fljaxOEDfG2/yeWL1EntIX66tdBf/I+r+WGXItb7BFL1QjnjQAAoOJOCpRofVIXwIFg6U182pQ4nNJLldkKhOfrgRT2Yl2oaAkfLBrQFqphhNN+tr/1/////9ZTlpxoxeoyVRzElkaltLESsf9PFlOcPvXYhltmzYRJWSV0cpQhSrO0wpiLInnhUKxyeH8GYc8oNezW4XPcgIAEeJJao5CyMe//4jSqWZODpMS8yQ3gtDNWO+f7CenW8lLP9h4ffhZuFycbJOtTVNDb8kUQuVGNU3JmGIYAUaIZVDusnlK2Rm07U0gf6QpkEt2Gquu2K+SLT/rlvhL6mfb475L8gT///9aAQAACnI6IClEcwIgBRZAyDTgae+6Yacamyc0afaSP9A8Ap9/LVUCgOdlghRmC0KBEfJwkkoziE4pnLILtI2hBiTe0yXeUKGozoHEsRnVAdBjJv/7kmTVDuPGKtQbLDUiNuNaczDDkg55X1RsMHLY0Q1pzLYYsvtxTJM8Kl2Qi86fNHde2Ty4rpQtmewXwa3aXs4VPYWciktnUlvR37RFQAAHKO2KYOheUBfLQktFdqOvK45uq5OkFrVcPCENJTDAISoxaQsoywmKwCESVSD4omNnqe795qir2Wf/u/oAdBKUS5NtKMHuMClNcVG4h3A62wNPVaEQBZwzxL1l682cJiFyIsqMQEA4NW0zclEs+ZwgORphCi7hwO4kSjERhuCLbF4MUWThXHWl7uyOilcfAtkHTU02LVNv3Jg+ZJ0zpiUL29XYnGMSMhiiMkNvvEleH3/y2WL58uIcjqHy0vRxPXtbP6Cn+VIAqYYYdzHchTsMeKwnOIxWKhiYYKHjrQecCpuwYESJLfDmNeOnZWxoBCRGZAbos2pK9/b/Tkv4//+j9EdVAAAKsEIQHWhQoJmhcSYQ+BshU+FBEalIskIsGB2urDpCUzDXVLY5LxIQw83xa07pAKQ2YpKVYIHbRWcBBFppQ5nihYIZxPidBGjmvS0uWFX/+5Jk6Aqj2lPUOywctj4DGlM9iCwRKSlEbSR6SPKMKSj0mOjzdhQ1kkfblmppA4dXbZdKihARG4PRWxDXLLxjBIM2XxOc6vlqflH55feeTupUOtCEQoZJrDjqEBAAAADCpxd0kVsBguhiI8mJKNEb6ViYXKUgN11RZtFHkolD8iZmMPY3+r+p9JQ1StHtkP/t/V//+6zUWAALd/Z6BZjNXGTREOJEPmYeafIkAXqGgHdeNwGcvxA1BNxKYa0HBS6cttnceU5P3bh7i/cOx/P7dy3Uuo4V4hV3SW8sypEpyxDUXcnDTShUTOy7/QRlDouCmt6Mf1RDM2CGJ/1Ws69VMqdGBOrurw4dYdmxkUdQ5qVGAAG38Jdx12zKJLlEoGxrZHVoXc+nnOewYEW6YZj4jvL6w7gwwcTtbwwCZG/+5Hrf+Iuv//9ilQQbQBKTk1UgNQBMENHiHEP8WUpz/W0cbhoFsC/MtJPjHhy5QcPKCE6KNIyDGGky6FkCdCAeI+fz3pib1ibRENOsR0b6jtMIDO1jLo+fQnVJFV7tplfi/Kf+//uSZOcMRD9OURtPHaA75MpaMGWUD1ElTGygWoDYC+mM8ZoYWXn82lvUYHAPLcUrtACgpCIwWOlLB0gAQAAAC5oqOChUcZYkGXOVwWhhmCjk6HjLBcTYZSI3rRMrff6iuw2aCQLgQHlTde/U13+39ZH2Ld///+xQADeIyIBaRn4KI58ziRMMLTXRQzawMZI02RIZGAVaicSgidSdyxC948GNyZUKBJMNLtfhhRZJFGXuukKqgnLEWcQMnBDUmV3E2/gSgY3BzZ1rX7z6w5KLokoFlIhanacOIwCtBkRiKkJfbVgZRo5h9daLE0a0oQSj1l9tVdH0+xzLE2nNzsU2qFvbDJ9yXjxLTpQiMGXS500IhCoFOPuKUKRiGEgkYWzsyAaERiXa6+kJimEmSQGTcLb9cQ1ZnZJt44aYWWqpThxf/T06dnLev9G3t1uT3AAACrZo1RE65g574wDNDNnRacyBRzoPTOdBE1bsRh2Zch24IdZso0AlruNOYjArguqnytRuCgQkVbMzBiMAKvh97HYvKJr2kENWt37kklDHHdEnsP/7kmTrgKN9V1dR6BzWPQJqSiXpGBNlXUBNpHqA7IvpXPYY4qYqpBc7o6LjEl2jVR5HrisgwbWqzFGLZIHLMzKFSSd/LYv+LxH8+RChfUb0NmYwa2br9/gynYAASgRAJDst+J80fbhPo6gEeccJZOGVC+JoC4gseR8u0b95jZ5L539b/+fr5Gb3if/B7FO//zC8on4sQImAE8LRjGpjZpnSZnyYNKGICmUdvUg+6JVNozrFQloTEtVg2gXJ2A6REiYn1Bom2KMwplTcobaKHCKiVsfnnJdyGp+zTtdgR/M8Jup94IO4NZhtXDjYOQ4OSObcjN4mAaiL5LHhf8UigOl3IdOUje595Nv8/hH29pIPUDmT26dbZvE0ANRAkFS0Vqxq6Gq21zlsqx3zMyMNOjJDOZHq+k2sQ+98zFa9/YwpkI0+P/pX+W+c7P//5LLBEbUAANGRYxVO95BNQJBhH09S8ngiEyiocQuY7gER3dV8SC1qgYug/Fl0PyKgC2NIgemKBkYjATSR4NHomOgo6AAqYgIHP+60GorwWqOBBAHMiGb/+5Jk6QoEUU5Rm0wekjyHCr08IpyQQS9JTRh6SN8MaqjzCgpizV6Y7Pw3UjyK5LGA7k0qJlRfeRPLFJPdSpIImbN+ZrztXMLbZy677kOffCqdTkM5mRHZ9zkv0maWnfV2LbsD6Xye27ujQHma4AALEuNDkJwlC8nmjhJIwyVefNSdpIEFHIMflmb+xknWeVR2vfwsULqRBFZyiKf3K//f////vzTgVao2GGDFlTbERwmdIQNNDHtkqBUKykLhy5kEawKTMUge7NA+ghgdrKwHnMLmcJhq0AOjxdiyFyFfKxeaTbIUwiyhawn1eTgufZH6HvCECQDEl0MJwSTBEZUli1nTue63Y+ykCrzJYw53NfaSBX/nW/uvt88X6Tkuzd14HZWiIB7AACnh7FlDKhzZWBGDLRLZRFV6+/u3N/Dmq/27/32/92////8v///////0zgDlcziz5QAAAYI2CkhuBRoWghBmiVGmFGDjhYIWvLXGUgkR5nbPS2FAxWhlbyQIFwgcjdaIITAMzHgbA4i+zEmtqDpgK3Q2ymHWCQ402Uw6//uSZOeOBNNKzxNMFqI4IvpDPYYcD9SdRm08y8jPqqtoV4kL1JGtwuBwN37zYHte0wyfYOBgDoHSMdXsQUocZiNRVgijgCBvi2oQh0pcNOJowxr2YMoRZw+/OayZyz/PNOwwdYHD3XyR34AAMmAS0BR3ecchdr0c9E0CyO+NtP2iaZzbUdNK6hT0Dm1b9u9ywOIOC1JV3//////XZWAZWembmJphEafADyKuMWKgSRsrDgtWAAMyZyb7EgYAwc09QEWA2eINo+lAe0OWMiHlJurQmGqYNAYaudYGHWvOA+rBpWpu672vaNADnsmQ6xGVQ5TPQ1IwLILAeSg2SMoiyEUYUMwKaOXGKUSCovHDnkKWikTe0in//rl+Sack+F9U5le8jJEZc7DQyPM8ol5mAQCwkQAEgLfBo2eRACOE5J5t7vNmPtIg1clp7JVzRhH/ZEPxDm/3PICAhor//////65xwQUCAAAALiqJpIRxFQJRi3AQnQqUMKuWwXMgM0Jd0nURsQmJMOQqiTKbCv1lI0aD3lYGJj4kGIAunIlqO+lkz//7kmTkDgSFStCbSR6SMsSayhhGppJdX0RtpHpAzQvrKPMJ0pgzcWcvJTsYgiGYLBQ0U39VVabEKd9HmdVkY6+wKWWJz1CbLROT3asystt9v39kdHccclyy+8SoqtUMS0vppEP7VAdzXHU+5fM32zMro/7/rFQBJQBAKAsn2Iz0+iQ9W8NQHDZKUV+VGc+DeKQysX68KG6sxMFsVa16fKGv4t//////20gBOXPwDCRv54AejKGHwdMGRhfBYjnGKEpoPlUGQcZdlaLSICgZN+H7G0GQ4nAU8o6LjwC9QZjQHhCPBBEALSgwQQkH5YweFI/UhnhwKRD8MfKD8NQ65dJJZzbnk9sbmJDJNfCysKvpb/UtlNuPjWrGCn3pc5a7mhWtsKmbifXWgVd2LrtFKABBjYQSbA4sEgwZ7zaxVW7CBEBlENRMskghZ86uGDsC+2gRp2m2Rz1ocS5fZ//////61QAACXSAAMqETO7ADGJpa2YwiA6cEK2jmYKGFAEZ6ZCyDDi6Vanej5foKJb1lQWKrqHYbZmJKRmgBBYWEkMx0MX/+5Jk3g4EfjBRu1hi8jQDCrowZoaQlPtMbTDUiMuL7HQ0iOozdp612Hu42BlLVHxirgMoa1yXujkruGJMOr9zkDhnU/Xy1xb07YhWErTxcd0tZ3Jw91zZjmLazM7V1+vs4kP5gN2dKN8Ud/sQ+/iKFOYdMrN/ImfAcNAALAGzAQ43X8ZaPzSPgEyEztHNbVDnkH6QXh2G6+NDKl5MMt1wKzfrFuhC/t///////qAALm/SeGnAVAIYgp+VIlbQUwr9LNXYITVe80CtM6/kIa1ORBw1mS37S/4KtPg1KJw58njKkh6O8b667AyM7tZfaOqc32ut992aWXWmUu9WCZs1AIlhnQpiVmoyAqMQP2P/hZ+4hyJ62Osy5ymZMxku1U1RzK7xv+xuVlBIAKLA0qQE+N6Q0ebLbePEduwIx4gxro1I/U1OW+XhCvOmFxmlXyn//////1F4RWoAgqBBwfGH04YZjBkx0mogGZvFJn1QGCBsYCD4CJwFRgVQDgk3h1aqBdUVWGDLQBUBLUxJWwRFgdX8ZTtC0CkymSVTDEcGlISk//uSZN8MhLQ00Rt4Y2IzAwqDPShYD31dTmywdsC8DCqcNgxq9lb3WdJZKTatroSF54WrjPFm9PLy7iU6Dl1Ifkc9uoCNOyOt9ddh5lYyycp6rnaxOr51xzv3rTBVxbTHYZnq/PZ87aWfIkymEj72UuItckO24sAAwIKaYHvnRZIelcstylWNQPW7SysuTv+h6/XIuVf/9r/////////////0UYIMGmAThVETagAM7TFR43JfQnDZMYADBCaPAxEjmCp4lgsAgiGGMrPYul2q13FbXleR22mq2sqYoXmfmyxJhyuIutVYCXP+p592+i6p0eFHMIcfyZopdbKKTQsqhaDSMxEUWQqV5sR+78evkjangigIPURIm1xSM1C679nDAaWfJoPHGakNZMgAAxJEFIpxjvyoC2OqOmMB8XlP32afaxqrm+k265SAxgE1gCGGTCaPFkK/+t/r///8jdUAAApRrhmREZ2FmPTZvSyAm84cIMOrVgQMiA0EMSKGdu0XwGAVpazGaJyKElpVgCIVT4a2oICAJea6F0F53aTRbxMxw//7kmTjjgTbPc6LmGLwMCrK6iQlfpCErUBt4SvAywwr9GYVVk52JMUuO/DjdI64iG0qey/FbcotWTzuE0LCqKDjyuskPgRk8Y73foHQOAObhjRkNfrzpkOMCv3joiG6P1wYjGXCRAyB374niC+bFK3rABRew7YhLEhBDz1hwvGQc3p5U+1ixzRMdtIwloEeInJZMs0Vu43GuuX7vq/9Zz+j//QoAyM+MdNxM3M5UTHDsEpJoJAZQlBiG1pTMdJQEgVSleaaQLDxaxChooBEBFLMciJQhASr9kqpw4CqjE1GeT6tjxv5cttYeNUjRHrS1qzT8/IJ/Aqw4GBwMA0hSQbCJVGBdhBErlygtbNl2a73tYs9Zc8t9Q2vWl0l1On8crtG3+z89R+6JS8VZTghZ5NVnVZDgASpJJY0ax1BIuQ4qmTvjBww9WcpCSCZaDUiCMezapfXeilLP6f2f+S///+xTAAAC40tzCixEEMZDMTJBBcjAjC4cCpcBYYAjiNr2tbd1rjLlPrXbFGSBAvOXUjXWaOWzttRYe+kUYS77JFaJS//+5Jk4Q4EiEDQG2kekDLB+lM9hioR5TtCbeELyLyGKlzEsKLcVpmVv9F7oQL9Q54X2CiBMGTRw+Ege3WNi0dpKfJhRlIurWl+MQKli1vy918nZo9pXUiXs4ciuK5tcspb/s+GAATcx3yjI2zM51MFHbmlAkeQuqQJBZ4tL+T7eHHBRppqXlnvrtbTKLdUjYn/l/UeiL+n6yk4/oS0J6F3IjoRFU6ty4HEWks1qrttwa7Vhywqo1/EhA+0PPy6LpxZyLCLuSwspZ07Ds0jowdPTmV8nDqIcZco7sUs/pQSv3Uc8bfL4l5Q8ZJEDdqRzXV1f/mCb3UiCDEtORJLSpykRH/38qRywSz0EOpIx5UX9QlEAWJoAQA4OMv1MjUsfpW6GkAIsJQewKaA1SSBkoS5KUalVFDAZccJjnz0Wk/rV1/+r///q+jiigAAAHCwNGOnaw5rWQZKEGBpghEDBkky8FLPCAgMXQy74dpXJxE8qpV4nBcsL3rSVjYVYZwKmm3lfBVJrrQwQhaQXYl2y5mLBZI1ptXXWarS/DtSaT01WUPR//uSZN8OI/8yUhtGHiI0IgpzPMtUj41BTGwkeNDQCKmo9JjIAUDx0UrgciFmWEnkuueLl0aZToUQy0RdMxvrbp3xT/3f8Ydue9sXvqj9qHu8b/LebNesC24sw8134zbAAAfgyg50hghzGKXurg1LYEqdzagyfvnzgeC3BKKSHvkVRhDYj4kKSXhTN0REFBQNFziKkOdqSsn/8//o/+kLE/gV6K5oF1GUIA0kaByZoYTVjBhEKAoGKBaZLygZUqRU4GJpXRZqwtxPmExRun0Ow0S6sx7o8chCpVYXNWJBUISIQbSpViHq5WPbJWxMGgaVjlUWEj0dOWUIJZJzGXBxw06IWTr0syImvvq5laqE9C8seZdczmYoQoMDLUEBhdsxilOAG2kBtgYcffbpKxPf6bh/KRPJNYodZKDYkYZE7TJDxtfFgGUhh5VAkQgMqs////+XQhrdEhUCQABRUtgmIOQxI8HOrDoDyoMtxtog0WnVA4z7UHJe3STyphasEoj+MLFB8eH+klGXEsChmYUAkh4sPDiCBGI8bH0o5rd/6aZExf/7kGTrjgSiNk+beEryPsL6I2HmHhB9B0RNPQ2A1gbraPSBkilLzWOkDuSoVHat+9+299q2qb1y8v3PjEgczjBjSwlxMUWLNSjmVip7vfWEXaCJ6dm5lEXAFYSnwQYQLXcQWAhKrut2dcTIhASeZlCZJimU3zf53PJqTI0EuBA9//5LR///Joo/bniLnuBOJqmAC0m5g7gjg3Rwg/RNThCFi2nMcgaZ5vyFjfeMKgUECQPksbCw39F9jX+vmesr6b71RMUq96kBMbbcQhIhHkDRmWGxYJL6U3M6L/tR5iYrUcXGh3Bs8XkedcMJNH1lzzJh2fGn9S92OSnZLbjj56h/7hKpl6iZ44o3cx4e+kBQK9o2IYtDIAWsgAJR18jIGaeONm2NDBbzVceEEXpUGq7ZZFvpnP1BpXb+FLPWqKBHF+sDppZcJW/inT//r//o6AAA8gGM8gMTMKMz2F7mcCFtUDlbRwEZSlMDl+TEUpaB5Wcw/ARVAEt3pbjEUc30S5cperS4kYQVGqs4o8yuVNJ10x6KVvy1xmD1trDU68SUbP/7kmTjgAQjV9S7LBzmMGPrOhQjl5D1b2FHsRUY5oyrKGetCv7ceoakTZw0+I3X5kUDXhQBh9NQSuIYv+1iC2IymorOw7aTQpGNzX2eegvIlEd1PrR70eezToWRse/N1KRfPEiSr/6ZGipLLuzuHOgxsazDRd7CScue+opR7EAbKIACCisSIDyY2Q7s7YEmlmZiKT4osQ+BMQZGSKbZcHNVsj1f0vOM809X9v8n/d/6vd/9T6RBPWVhBy2QqtT0PNbJZDw0kW9edQCjqIg1JLRC3HTOQpSRVYxvY5d2FrYQvkAbGghyjUL5jeRzsGC3rNYbgysDg2Yi+WJAYYkKWBiAWK0XxWSy9CkjeyANmY2IZrqqi1QDPCwfs9LzXO+eyvTdQYmzQzMtB0uYjwawzbTgxnUENknyV0CB7JASe/Endk5E0otMCv2wI3nVSco20SR/+K/+vckypQW9v+X/+sXWd5Y162e15tX3sr03GhEFkESO4kUBZKAAEm7KFaKRbHSoRcI9NQJjiu4feNrbOYs62dtCWBhZFIeSy876ed5AplH/+5Jk54oFU1zSkyxHgDdj2w0l4kaQdVtW7DxPyPCjLSgXlUsyxevw4UvxuCV16f/MCBq1v643/rMdvm3nEuvAj2d7PBghV/oMPJ97lhZ2AWd/eLyHIcUgx6c+a8P1QUJOSph5xNMOa+LaF8Z+M0OUAnBuKDd3oY9BHdnAU5rv3tVXGoydHWX5d/lyqJ5NjWR/fUEb/////071ZH/nKyPlZxoqgFIBBKcl6+IiEFN8K8OUCkQsvBpCamIklpMm5WZmcWTcZXwYkjPJpqnZ4kR/a7VPrcldJEnE2q5+4Rwo67sW2/Wc6UCuwdKHXqF5lGEmyYliedvPQ7PYmK+/tv/zepM8h9lyWea6t5u+hya+FV9fZyK/BdJRmNVDKFAEACJcBvmFA/OVr0R+CCCNshzck1ykpi3jtDRq9zsOJUdWsRV3iQZtab1f3f/b/0+GlQAACnFhgx4M4AQcWmzWZgEGYaRrKkUALtawISw0sQbobllWUNYIAVClAFyKbFVBUrd2QGGCgZSEoQuBAzkMpgEGJChp4kWXYgTA0F6JSVh/tzxi//uSZNWAA7lOWNMPG/Y0yUsXHCK2jzVtYUeYetDHDiqcxJT6et5zqCE3v8HaywotFLBNR6m3jl1TfbbEtvxayvc6rW2308Slr+tv9TXut/ZXF4/IrnVfr6lLZPsImO539v6738wAAAAIAUpKCEh9WKF4r2BcLIlggKSp5DUmwUmrJxAAUcLTpMsL1ow0ImM1ZoqOQeXdhRYFYRCpN4bSz9BUrAI2cWZgBVC4YZg/A1FNgFCzwqClm18BgAXYRDEgaD5EyJxlYm5ZO6YABqqoSFHHaS5vK1QDdkSfr+r6VM9F6GZ2F22kAPwwEsuaSVnmBka0YuJLSt6rbYQYSOrn3QvGuznHh1yqyonUmOVKp2ldZyGeh41ABVsPE8+J4F7qFb62Ey6sOGS/fqACgcBB2BEtkRaK6ajMxxDCQsihuTsTjIswj/ESNp5aBSCtxM0aB4mq3+/9//////4oAAAKcEUmdC5BBWApIRgZiIEbYFmaCJjYUBQRE0wcnIgpm6I6ejwtOAgJB7K4JWwiYg+rayhxlVWJDwwvhT0nIgBt2ltdXP/7kmTojoScNNEbeXlyPGMaOT2JVBEpA0ZtrHjIxwwqXPSMMpFHwbZ6KJaLE1wPq50Pxl/5fMwKJJjHcmFh/JBCxwhBbsqB05F2ULu3MPNKtJq3ZcWhWKK0fdqgjmBxzHHTI3Z19tXTcsnd1y2ujCHUs0eg/CGpZRguhxlyUc16fZyNI8iCOmRPV5P79cgiiM6TP/kQf/2AUz1NKCtS+/f/////vjQE6YcWn0GpiKMMARsCwYsbF2TAgpHtmlKDlBnRAdH5aLxXlxsEceaYW2jYVSRpubKVvInLGYasIHGnYqmsXnhMMxmNNxldxTWM0kit15VBkQQIGcxgTq2mZ5k2XV/W8UHh8jKCjos3e24usDDLKcYRY1KR9thamsqdfFyIpdObhYABgQAABJ0YQiWheExKKsBdD24kD/EnBJcXvDsYpRCU+CIXC4fIqhgX62fZZ2C1vo/////6agAFwCqRwLiNOpmaKZvKio0MBJhouAghWAaChouKwswIGGAAWIICVWSOSZbk+6xgcC3SYJitqHIvPMUL6shUgoUvNipdCM3/+5Jk4g4EpVPQm2YWojMkaxo9hTiQELtEbeErwNQIafR2DDAdhr7IYZeJv+wuVRnKbdKcPobgjgRJvOxg9QCJSeu/rzLU+Ks0mfLHwqGZG9H5joP+VZXyJul70/q/mgksWgKGQ7boACUYEpSjhhmArpQzaRJqSsZrf7DLu5jcE9P55icP1/88P/yVf/5Mprz+c///////9tRsM4hC52k5BfAcBmb3STUTuvjAHwQ0BAcKjDKOwuNMeHa4HK32goACi9TaciiKDET5/rRdz+AkwlIRw/hsEOA1TXLquXx4PC7Lk6RyK9UMbxGVhOCFLd4cVlX6arGisK4fRJIOJaNst/a+ayXxtuxq0HW94+PvcTVZZGYbP85BuxfeX/98GsCNd7oyXXL9AAGAAFJihofy2VBcbjY3stCKBmA2YQA4TBQQuLVV3kFKWGotWntrQ/ZUno/9jv///+roAAALgMMET/gYkQTKBA09EHv0wUPMQRBAFtVEg0wtQMpAWFTEulOPYFQu8s6GmwDyVTMybgvFuTiFw3t9a6PzSpatdwoHemea//uSZOIPBEhJ0JNpFqA0KrrqGCKskXzXQA5p4YjMCGooxIyqS/UYlLdX2rV6+6CRUYeFnDTBQoxSD0VwhUVRNRhFvRHB7T3LQ12vr1a39V/NzylxMjYCHyUDZZpvN7pf/DIHufQAQAEFyDKHGmJ0esiFJElGWw6eWLBNtxsgos8PC3pMyFRLUI1TFs/mWxiv2/5O//+Q//1uAb4gtHsGjcEwvw1jI1QEedAEiYhcjUl4FmMYQeW2pG1OM4ljxv6wpksBPu+C62vTCJrP680kTOsTp5iv+c1DKnRZtPqNZczr1oYvgdUZoO8kHT3SlLJoQQrwhkdZFtuLNGn7Xz+/l5fEd48eooAmk5uI3/OEl6/p7//9f+J4igY+TaQAUbAoJuXWAk1cUbfjC9spXY/uigx204gn3/05pwAdr/ygY7vt9TvoJ/6r5OoAAAR0w2qOTiTZh4oojfmszo5NoPAYKiRkYWLEwIYepCUAvaWgqstAQMSRspf1aKAguvH3vVWDmSEueXkLF4fdkRhCEoXGZgjI8FJFoaf4qgjqIi+a1n8lr//7kmTjDgRJPdCbeELyM+HaVz0mNpBpXUZtGHpAsAWr6CCkCmQJJ1Z16mcqkPaS/eCTMQtdMrC0taXYwWYCAZqF0cIrm9mLuooc0FmZDIRDg53WXyTOuzxC1dO8zl7AhrT3MLW4zczj1ockEakkYdinZwMZBEu+Wk9AOkuCTJqb5tu7NiuU6jK1ab31pIMXcVzhv3GfdC+I1NzIYoGqsNcC8hqKI3Q1OqzIWI1wCEVHEUEQm7/UzgCe6MYRRwR+9N4kj9vUQU/Oqjf/+hifnJ////Vn0TZW/9Epox0Z9GnJRGoqMf+vyM5/yBEJOrkEuShHOwaE5x/nkoLGm4mwQtOXHfEcJThcdOdcbRU4QNu42n3dpTbL5GAlFZW+gR7VKH3RzV+GGNwh5SEPuw01ApKgCjqUNiWDl0mh59FysOPCIyK5wY0eLAXtRFCYZ5rybcR+sIESGhStXTx+xKxVq/bY8YGrR5STPGdOt11KjFRTMuKv8Ot3jvP4cVwYhzp5HKNaiKJFqfKtfMzknjjumW+E3Obe/ZnAwBAht+eUitpZDUf/+5Jk648HDFxPm3p68EMre20NImWYnXFKDL07ALOSrDSwotFHTuozmu1cDgXITgySxJ4MCPWQBQUi1ADEAB3aJsiSgF56a9WLm5uN7t0NjQR+Tci/khKvH8spbvaiosCJ9HOVAB0QAAAt14A4qrxV6GzNVB6JPsiWwhNR2WdOS68efxglLYm13v1nH5kWPaeaxAcCRl+aF6Hckcj1B8UzrEJWhUbtUeWsaSoWGMjvE9cPiQhZ1mFzx8gHMF9gXtYSEHPNXdosTSoWMUaali8P+3dOrEHEl2p6QJU2rmIJHvMTPYws/j/yq+1vsZUVz1RKQlWACpoABQ4GjbqQUWTyhnP7ef86HbRzfs3WtKMnmoEdP/+7ej0LtaXUIDzVKjnf/9ADo7AliECOJJUwDR+Biig7K24l8q7r3VUoFZMXPkNh9Wlp9xSBLQKQ5C8HSXE77GriRYEarxuaF1WswN7odMRALCKxmli+ExD0ZO10i3OZlhIULqBjgtTmrWqqlVwVatgObDAbnz5vKyatM7r85nxZ/VmIGpOIkkcKHK5EK4UV//uSZJ8CBHlX1tMMRpAvxKsaDSdmkvlfUkw8uoDQFSsUZRaQr3kh0hPZSDmplUWDyt+XprEn2d0USCyMgBAGPNBQNGiAca4DHkz0HNB2eXD7DoGIMTtOUS6PUoewXodIP1HbrqpepOB373mHIyr/6kIAATdsynS+7UThBESoICCqREQ0eqHIMeqQtMNwU5A4qG36n2flvnWzdIinL84u2mdIHZVXYmifOSEOSm4HWg3RtBooBIFYEejcosc2rKhdflMjypnYkjcS7k9OcjAYSVpbShASl6FCtx4JxFNM7LxWYjbp2ZDED6KPH6u9NNr7d7dK4DoUxyER0OZiIdlGM1ls4rt8z3poow3lQ4wDGs3IiAw5KitgXUAFiQpWSzkI0jvTxllqtnk/hbixaPQrAkI+xGT//9uozQYIsUXB1Wp39UAAAEAyv2QFGYKcwxyjs/B4AwIWcghdbH3aeF4F+33gaa+1PMumtWHI9AAGBbWXKowNCZQ8D9M9f50mnSeWNZrVhyc1AVOJVO097Wm6tfvc3ztacoRIGZ0pZAqGpLH9r//7kmSYiAT5V9OTLC8gMgSrXwWCShK9cVNMrLyAyg3rNIeqCDVlNWkyby7ZLz5x1/G0Fy243cy9c7t/8wlUpWQeRmLbVSv5UOwufLRw8zMjKpQKSr5yMY5PjyAAABAAQBQAlFguUsNl9KePaxecNdeCZt7LlZzaEZewyNKHUJbBLC9/lvB3PrDXR//W6gAAccOzr00HTgliGSB4iEDUhEwMDMuBh5NSoMKAUuxGBRExSmIJaAgBiMBPso6tSHlit2C8bhtZHB08lqTABCZ6FynzbC2adlq3oU6hZUwSVuTDlwBSxWBVOw4CtbrY2GZuZAZMa/dTEi3atQjsPcSDjGn3boE01LT4bVZaH4Nd1G6y73LB1X3iR/XX1uS8X7+LSf024P5xSaF94STX6y+32oBQABEAgUGAUNl5H5kBjaEYED3zLsXqvMt5RE96k7+eFsXOBmIJI/+6it4kz31s4x+sA2BYVOcGCoRGaB4FKQKfGGg5gbGOh5hQC4QXAGRRFM0UEZC4wqFs/ut1TdXI9b9L8CDxC571gZp33sWBijFX5f//+5Jkio4FHD1SE3l7cjBDeswkarASKVVKbaRagMsN6uiXrcBoNSpGuTKqYQATvaOU3q1/QEqHVYMg+YKihJKdGKgsbg6eM1Tl2dm+Xfia7724nQMO5TFbcj7ZGU19l3/KkEhdQzsQBdGlIoMCZlDUbYRDKQAAwAqGYA4qI8JWhwt5NIxeu+fIiFajVqiyavqLRtuG17KnG8BhvTJemYOzJZ137uWfogAYgACLctiAstaSNqxXCKFrVb9k7S3jjUPOTHuzBdSNRKIIgZoybF443GaVp3IxGbDkQn+M3/7ptZJdtp281X+7+25u0aEH2hqK+YutVNltiqjzEVkX/ntmAj98PPiId2dsdbHv/rzGGgX7wp1lRc8RvoBMxYGhAB6AlkohHCAYIQdnJQKtWZYngb102D9DsPRY0IEYEV/b1vi3SerUuKf/VR/////94ACKmxUGPaIL1Bz5xqAgEFZDohcYaGbk0o+460YLKnhhmIqldtHSsrAHmjKoG+PGXkacjPFiw1tNPHF2wfLhJ6XlLp/6OTUEHQOpjzcFSNb7ylAq//uSZH2AA6pPV9MJNBYyIyqnJaNwjhS7Umy8a8jODCnMwwoSb79/RF/t791oSQpbK/zI2mfT10u2MWptSZ9bIHoAAYgKEaiCMATBAXnK67VY2Jj5cLbdx4UVpoMt9R3OSRdLGpBBIgcpGqf92v+v+z////6KAgAAAnYVDB8TpRLBIxLkZTsLMAgLAwFFFAy0zXIm1J3IiyJk0bbSnl7awXIF1lyKeVNHb/3KXm6cah2Lu5CX6iMsyYTB1WXSvGPTE1HknuPXcwdLIFE9vg50oTr4oqbktUUkfdQ6GM6tyW3IMRTsK0alFZrIyi8SmeaVGEnOXEk3A9+00aAAFAAqALGEJYiBsGjoQHJDVKoFdbAtXWkxyGUxSBl2xOJrvT+Zm2gSxUjKbClapf3/6AHKOoiOwF5RtUhhziWq9C3QQgDtg8cBglb6jTGlhShUDobA5ncosBqlghB50zj5SSJWg/jxNYyU6YquQSGsZ8AHDOj21dSIltXpWnMkWDGYPbdaO5SqCGFDkZC4IdTMbjg272WjIzZlPe/Z2R2YpVR6e/5KPP/7kmSWisQsS1M7Ri6SMoMKUzEnXI/VL0ptPE3I1hKpSPSJeDou7llUnX00NKAHwDUfieJq5VcrIaraRVmGVNWBQ0x7M9GkTR/QbNXkBqGfYz0tkmsuf9ft7FCB9BBo6oM/9VUAEFOQhAHPBGGFEIIKiWgQkCl67HlN2jQU8UMPdXjNbBpPI5IYhGHhRpzqPofOnonqkq5iJYsfzwWOGHO13ZOy5HHT1sUUrqrKiuc6554UcVyk13zfW9uoT38XXb8c6XqNiPu5TFvvPNPljtwWfEWHOwwAtamgABFALoYbQSAg8TCCdhuoTLX46u2CWlr2aduTn0NniKOmf7j87k2vJYaWFrL9KP+JQAG9I8jagIGE8icYAQoVXAROZUCgGSSEANjYhHo6ix6igd/X763aFBwulkKZLjSKmS0deX0MWeCKRdr1LAzk0D8PiXIYI/lS9dymb0ZCOMsJcuziNC6JOuowh1pKmt6wKNPpOiCZXmdhRyOcXn8lNSsyuY9zH2frMZ0/nF730VN7DIAAKAthCLywqEg5Hw3EpWcni14/9SH/+5JknwxDqjzUm0xFNjEDCmY9hhyQPS1GTSS6QNSMKUzBmlBUcVsqr+i/Ck5BFwx3pJRiEkBNR7bICdk//b/////6FQAATLyEabsQCQ5qwowULSkJIZjI/gIiVhGkKWKRYWnjDDXF1RBm7xDIFncGVYOg6fssDc+Vsji75Lae2V3oMmqdYMAgzLrwCHs87enOVKqYSBwFi2Nm/1YLALrDqvvtc4SDD7REBK/ZbBhNVVFv+58fq86z/+sr3Pc3V9ibUsgQfXqUFyz0jikZ1vUIEwuFAoglkZ59QNrtyyHubcLIGAxlO2LaWZ19hVqoIIggSnnSeTMkBGC4u0/vvjWZUWLvzSLioHQuUOI/8h/////5d+OWBwBGALbijZNlk7dQuWdWIrchCxNS13l+rqje4k1yB4/lTrxV/ftR+7KKtPTW7it1Xc7K9UFWnguGacvdnn3X39V4KD0pU/S9KUgjaZhgbnHHcprJtsFE5/6xvarbT1No3rywgBWOcZ3NxoAYvOyqV4DuiExmXDAvqEaRIvsloXbmMQaZIgpP4VGebrJa//uSZK8CBThdUptMTpArAvtKDCN3ktlpWUww2ti7EOu0gJ3gf/qmi0kTptdMVC2AAFQCAIS8PPyJeaV4qmoCxcc5mH+9Boa5jNSn+UiCa+kweeFRX3/+R/+3///+9QAAKQAAAAVI2EiEjammvhpDHRGlXtI/yJr/LxmWNuVh8JDKaJ+WM7oC+xNb2pNk6nSVmIf543vIuE6+Zz1AWRrzMD9obsxG+qILyajVDc254q4YysoN9CYWTOjq6FYCxq8VktatWs3L3S607qkEFPDCB9axah2ULft+dtt5DEk45CNXvnuz1KKyBvaldfw14Bbg2S7ND+cNWoG0WGNCqzuWSjlAkGT/JJ0Zl1QRRMJRUAUEzDLJrRi2Qfb8HrWNV//v3////+D8gAgABLQCHcO6Fxl1l2GZl4V/oD3JJo2ARmLNmkkSTr7Wo1O0EkIeZua5pbLcHeqx8lZIgGIPlzJ06R043DwyAFJmwXa8ttdp5FT14CYTS3al6/QVMhlCmBOhZiUE41RCAZaSX2cTTUNFGZD5Tcp95HFaTq35TZAk2rFiEf/7kmSiCAS1UVXrD0tyMQPbSgwHkJMZY1VMpLzBGS8raDe02saVXWT2HzK2NoG/7ZE3R6yl0eMF2X7PEQIVcjIgAyIAAQiNCrUg9ktBG8Vk7yWtkW3N1n3O+ykiUOGluyzIMCjP/Uv/XJBG/8xV/6m91P0STpf6jDofW/////////8nDwDnMgAAFCAAAFU5hxI8OL5Dg4MKMRCg5OoDAGmmQDoA2/j7B5Ak8rSteXsNawBrDxQPHQwG9un8l1pTsKux4DGorJOSmNP8y6pNHBIzDTtT1uGLXigsrhIj93HR4HHiXwBDNY8oup3eo2PaHDavzzW8cmvb1LaBlkuMeViw37Dw9M+mGz+E4ikX/8+1/CZIhPUtUR2vHZB2uOJnN6iM4KwACASALREwkjISsIcIBztO8gqHvGdTH6k0I9axMMiJ270AOb9Kf9YSRP9A23q///////6x6HpL2ApAe3MYgQGJfiERGQwyWjGfkWmltExlxH+ISFbJQ8w6Qcg8fbG5IjPU5pnSlsMxkzl1jzSg1DnFa0NtdkKi5joz5Q7O4Vr/+5JkjYsEzlJUY0xGoDelOw0F5RqSKQVOrOl2wMyUrTQUnRLsplzNbW1JYYXbMShhrMKr2ENoem9P32z39X4iMlR+UidsUwkj7tj2w+0y3rq5juUSaday5PfuNYSH2QC2KCxsNZGHjLqVFmgksxkMICMAbAlCQFwUCaIwrtFn7NMCw4681pjU+Km/9/9YTM6qPG9SjFvAv//////8WkqAAAAAAAVW8LklmRMOVSAKWuOOAxQQKLFBDIMRoryDQqN6uNnYsGHpUQsXUgc5b+osiQpmca9XnDKp/2noFsAnIxx9ljaY6FElZovYl1NMV403GCJ+Q1a1b7zHodkepTDNFQ2VgYXc1ztfgiBgLrtEdiQXodpUNJzG8/81V9U2Ukmx9XF3N/+jSv8a3I3K6rExVrkPM8CEAAGuBi2KihZzLLUpLsQuYYCXdO8WmQ9G0BfCBFtRiNM6dmlhvCnFnr/DvjvR/+8AyIcjQCAJLUzoPF0wFuGGiMI+m3TGg0JdAx5tHLfpmLn0dIkoNKMgjyPIceNGUj/KdXKMGSPA4R8K55pR//uSZIGGBJZL0tNYQ/AzQwrNPUZqENEtSGy89QjKjCpow5qCO1AqiyAGzFVrxzy/7ESaVtZmaWNLCKV8zPJn0e/GUg64kvqCWCKVNPSa6E7bsho1Y5TKoybb5phiO3Od7f/ecjEo2/pdNyz+8YQIiAABE0DPXJ1s2Ka7aielXQ5bwRSoTGO3nFJZzzOoKkZ+W/c0LDPy7mesx7CP+j/9VVUADAAAACrlGg1sgLMtEOSXgAo2QKYpnJ7GlkSAQK2F8J51UEe3vuIeIy5y3IOFYi/kNOMrEnB0kqONiyrGxwnY2MmqgUC3PDnmieA2qLesyQE9Pa7ep0vvKmZo1vi8EDnEUojOmM9iFmjVfjvnLtd13o7v1PR+9TC4cGCTYgfPcsdbkAMAARxAQAEAxZgmZEsFpyhwCZJkvkPURVZznDNP7FEgp9bNAiByLP9cdAtN6WO9f0/T9YJcbCDQRKhgUdNGqdophcOEBQgc105Key+DbRiMOiDiiz4Yhx2g6U+kMMDBJpZ0kdN4401SHJSqJltrTYoflzcoyzAAhZFSSiGaef/7kmSAiiQiTNLTLy1CMeMKbBnoShD470ZtMHpItovp6DeUqlVMVlxWWoFu8rLrjd14oH6bp1LdG3oKIFEaRiuRgN4ShGdWoAb+ZzKKPsb/5D+9+u1fHOCkHLa2jF63evgAHoCADHRzToqRgjHkOFFtbMjGUWm2dRU7Sj1fcaKjGV0siwHDxTqyuQ+71fklAAH2YGcDGCAAKyQBxCcDsLJ24J5rLOcbRzZQoOylTmBgkSxEsXfgNMahgRuJhSjU1pu7SqCAF0LEIDudt3W/c9uMCu9KkZq07SUzo4UMTOykHJIxCdgUK6VowS3nNQ2ccYrBdxhS/1Z781hr//Zm0fVgNyhZA8PwmlrGAK61ZeCTMozNoTSV4AQAABTOHycqovNgaDzUBNGtSVuPz/dRjHvavDpwYE72rrjNUAgujv6TC1JHNfb6oAAFufzxogkIRqAO4lSEoKVFQFDSVma42JEoyoW1EHI1Gi8TCrVBQMpcYjlZQpSA1PGFXuUJ/ja7uDYAJh2trUiooasui+NaJMPD6mb+Yg9jDtEadDDXmue7q3b/+5JkiYhkODTRk1hi8DBDumQwx4YO8TFQ7L0LgMiMaXD2GRg1v3Ji4ZvofVfDNNXz//3U7/o6D2QohYddPmpqgGDAK0ZFFVdHkd4uhkHLTjDD6KRYnWXY1rTIyXbMwryD87GMuzia5eSc4RP5sXXTV9IAApX5TsUGQ5Atwu+QzhAohCGCgciu8GNu1EJITqIwnec2k8pBWVKOY9lewNr6DpSNK6fdVJeuZXb4V5nh+stJcCqIHZcSErEMiM40Ud7GUHjVsYxEq8vRy45E9G/Vc1TO6p0v37NZ0UeLFGTtEQE1lQQnHmiaE8nD4tOQ8nyQswuRkhIXGWpHXh5G9ds12xzqo4xuvX+QURhQoNEJYNGkBChYyz+kAAAu5DiYQGWCA2oTfMCRJmQGBAVgUGi3wULLubxQ8iAP5isFA1ND0AF35KSCV1q9fOBXJm61ZpTN2pSeHKOfvUkRlnl9Xuhh+q2E/XpDR8Qlmc89EwCvApVQYhDH8ojdS+Q0OxWP20mD0Opboqsk5fOWyuZ5Zm+zNrWwr+7U36rSN4l63AQCASAS//uSZJgMA4hNVBsvKvA0wwoxMSxYEJEvRm0YuojUjCo0F6AqDRRcQJDBZ6J6KtvnN75Sa/3FwpbjzqdLu9Ro/20+Cx4ogq1lJEfV9P++s/xP//0VAAAKeZGOCkIzjCTCgw4AQgkZ0FgUgaYqk5Lfv26eEPMpn2HthTladIoZn0F4/Px6X2oqsdV1O8drOrnQPpHIeY80Ogqw3L2tqbssQom6n9zNYrlK/l0mw6f6vM374SATP/2dzqL52ZzJpEW8KVCMySIX0DMiylMzMncuIiIVRE4e///ERwN//64cOwAIoOUjAEKACA99wM9Ay6JRLfStg7b1xqGmtQzyrplfmeO+kv39QJ/6Hd3/T/59Dvd/yYASgFNyUgZAMKoMnCrpubP5sGpUAL9O44amF6JsXfR+C4kJj7qbjEXe3Cbd+ZgJ7M84YjeLbyCYsUr/PyzKGHqkN9jDLZZZhYiOlfCQaHkrDBPFSE1dfLcd270ofnzKhf8wxISvIbcdvtr1aHdOdl5xlwpq0heHRhe24+J8R8fgYPSW/EyTyeWySHBhf7VeZ//7kmSnAiR7WdKbTB6gLsL6mgjDHhaleVNMMftQrQMr6AMwUomrVW1pOw3v341Pz9B7eus4lq31+ERCLeL842hKalprNX8ChyTALkEhCRDYGGJQBgdWPCRwgXLC/Y3QKJKFf9bkaAw2Vk//9b////xZTeGJBQAAKgAAAApOWQXAJkEIDbG8LYWAZ52ARBZyfDkIOdTWvPFMA9x3ovGp63INZSeCvXkqK+sPn215waKOMFUiaRIbG6D5YbUzU6+yGVKgEHxS7dYtXxiTBrlHOhfNNFzW6/7gUM0LSShBFC5u5eHjuXumIijwpR5yGnlCowkdCbatQhH1d6W6IIy3VSkKmiNyNFh0gaCgRRqe9bY6FrTACAoUSQQXBWclp4UswGyAaZrhAcVPinNy/wcaj77Aw7L/9DvF/455NOz////Y6sBDwAfaMWiWKgiMKy+bUJYq1GZL1XsHtchyJy15ZLC10r+iLyWasvm8oLbioHbp2cP/P/Wi9STRK3JowJF1BlLKYJiVWnzzvW+3bEMK/wma1003NgGjhucecZnaJmditZ//+5JkloIE6V7W6exGkC8im00FI1KQxWVdLCxcQMaNbLwWFOAaq5WNXpqx3DoauxzIbSt2O6dFQSs662a6PqkHcoPV21X+HGS5AgAgkMAAgAA2LSaZp2VwiDcQBoQhzMe3ozjz5NWH688EvRn1E/z+op1o//7fb////+kSAAA82IRuBQS8CR5M9t2siyY8NLQnOrPyWNxG3DFCI3PK+0278+6+b9RYdC4DXpAm1ONMpM6Vx2Q15RMPQruNMxmIBY1K5jGlsTHbNWYS8i9LrUZamFhATrMrNu6lNWay9rw7MACN520qHM7dVRAZeh0fdrGuCVEdqtYEqr7QYgJ0GUvqhIuAB4BBABo2QlhDc69oGFRWsPgU2dFXM8VBYeRwxlTOv6Bu1saGG+GfHdfxdn/FfBX////9AKUgA1Wi86EAHPgFNWGB0VE0oCS1ajIrsNRp/IPhgLJvpBDvyq0y+RVnGUsJhmZOCsHArSpfTTLKENpVUsQWhFPzUbkpZl7KuDDlrSqLAExBXP+WGpA3C/CLTAnGI1S6221ZOgfLa8rRlGM9//uSZJOGBDlN1zMJFxA0Q0sqDShEkT1lWmysWojGjSuckyISTs4Q7Auiw5FFiUdn2mbnoSmj9tvyI7NbVCMYdJm1RAEAAHAVZKUMNLOFbAQXhDJ0euhLNk8/lqEgrQeiSppDAt+NTgcWKnOoN+/qd5X/z1IACAAAAAXKAxzDTHBToDWTVGjVgDBDUNSElDxWX/aRGYupbhfGXIRSSc4yrOxFATAc2zRLyj0zCloLoBjZmGYto4NUUQfKNOHWNvZt4elkKqDmubVu8gnbEmxvGtWIg8HV9XMcZdPuoTJTpOJmp808Vmr+a5b9Fdudzj0MfzR2792slc58tYAAFAAFAwKRGQ8vL6pEjQIhQIYSfdCa6x15IE5bsdUKAF6ObKExFHi3+UR/0NK+JHe//qgABTfqGeYEpg4EKFCgbgF3yZ55x4lfauqSXRG/DEQm0JMia02/hyUTlwhyFnu4BiLFcQ4BzgPqJqDMhvfqA3QYLuTe9w9+GRgj3W/nf1CKIujK4f7/yWVmelKa+PaRLW3va7BYfF0RtMqEfbHBEc6MtLgMUv/7kGSXCgQxUdbTLzvyM2Sa7CRnhBF9c1usvLHAyZIsaDWWyE9c1t35UHo6+hnId01FBAwqUSohGYQyaAFnAXhMARyBGIcBJJg/FhQ0rmHIItD5TkT/0x+/Gjs+VNAJNa7+AQeI/4kK9Rd3N/+iQAcAAIgt+YL8F8ACCxiTnUSEUsUoHuOwuN36QL2rYzYY7cp32mOAwqTcJD2OCZbQ3TV65T5qZqdhPMQc7bi7OtRKXpaDIntWvDakokgrSwsZeqZD2NnVs9pil/U1P5QpPtsohu0hit0+X+tPtoZ+pVMYCHSuhvFnAAcQAtIAfuwgh5UzPoCDw7qZWPppzfjmzATWYf/q/+gLRon6HHP/mmf/////////////o6N8qAWEYEAAAA1W7J8p8gcA80g7d2VLQOgPdpVJTzu4PY4uiROBDowG4cdW5CpiTMCUqlqwZd6s+rWflsox070WsVqNVIvbYu0FPKQoLjmu9Lpp01O3r7Uc3HcEjb/rckeBNaxnxttGvTSzBm3o4W3RalOd7mnKVQ6jfxJv1K1ufyvzIPuoiv/7kmSZgAPAX9fR7RcQOWv7SgynbpDFc1TsrLqA2K/tNJKJcrRommHWAQ6SQCGyANpfPHtVfCpiYcVtBV1Yr16ffhTaAP2/6+1agQGT//+v/////////////6Mj/ihVAAwAAAFO9siaRyQfEBiUt0e1lGYRa5MVYJrC7XGQhMni4vgl5oWMmjtMBzvE6bo51DlhbYNKeQsDLmcmQCs4YzmQTppyOUVOioONbd4LoksMVHVep5ddRx0/MzrdNnpcXHd9P1Per3Cj6qIuuv//8kl2raSIsmAZGCoNXBF1LwCy8ESCSTAHCoGhXjnUrWcSIrX2MIU03/W5i4jLkQFxxucRf5/29SJv7f////xkKzo/////QkN3wUuc/UAkRvwGKU0xMtUCTrrVEQViJF+dUd4fpzMB+LDmxK1UQUYeakeFOp0+8ZdZfixw5JlIWFUttbym/JRosc+IIQr8XZjiCDglmmepeWea0u8ZKR+MS4WRZh9HTpYVfEpj3Xp+bk32cjsKq0t7GUnyO93AAAKAKAkKgZAKOtLg04HymnfKAsugEyr/+5JkoYoD+ElVUw9DYDZHW00F6jWOyNVSbD0LyN0NqcyTJhByBbMDQ0lG4ZbbcsEyC/YRys8CtiiYufUvIOyLOqz/pQAAXdokDER0GBqFqEQCWiUBG4wIgvmuxScPxVuMOPxWlFCqVfpOUgwVVBwQR9QnC0Eo8rmRBQzgcxOgjYMQDMyti5M83fauTqW7uTszB0CGuva37urMuQ9FCXMuut2H84cdNC/U5nm9yhWe6GVJcOwaTvGiYe48Z/MW9gRIfKLLoX86R6Em1FhDUKgsu83AzsIPLU1SpbSFVZhrrS3uUDqRjsFa3+JGrl7D00xO93/YE718AxAEJDXoTgJiZCKgnHEYhDBRN00b3QeJnNus/kGS9z25U8FT8DLza/WhpAXC4yPB4D1ptxKcRoZPBFfc7fIZM6SGEDeXBK/8n1agCdf7Y/tRlhNgcBKVJlgJICtLplol6pvBAuwSuQEnHK0Boq4RNdhDRKhghPwR0t54IgPuzDcwoZNIDIVXXRMxhs0xglkxh+dRTCziblbsRz5db6M/cUMLPts871oAFvJA//uSZK8O49dJVJtMHGI1A1phPYZWDnCnUG0w1IDZEqlA9IloAjMBl5IUF3WDF/G4GUCrtMcAUoRSezNTavDsuiSTkKUpiurGw1j+yCwYLiSsiLQj0WiAsOlbxwhHzaxePQltRQhdqvP0XJaABnpfkQLJhIc05AlFDoEZPnEPNSg4DCYncLOOSVgXO7V3LlppYAEBIrDEJahj9V4mVIhTEQZMBiwkfCYVmMPOzSEGZ2XqOrjbIoazvEmf319id2GX0/s6IFOWDCZ4F1GmwucSCHj0tFLkRkb2vNNgJeLHYt0UnBUmWQgeJgCA+FCMUaakGGkDXUZJpQ0RCsQUYLFy5u1pl0GLGP/BA1Cl7fqHgAda5bTRc6vCI9i1jxXbPN42W7GcP/l/zRPZOlq69p9aFdfxgaSQABBcr3CWBkswEhOQikaMroFmJ3xt9sKcBhVwtcDzoIkYfReIBo8pT9X/u/u///6nXJoAAFzaWmR+GxpkGKKJdiR8NEUw0EJXF4VxUTSl7PJGWNRWJN3iMebCveML5YK1yPCMfyWTcejOyTTN7//7kmTBCoODLFSTTBxEMuSqYjzFWo4lXVbspG9YyIYqXMCkgsDUjD4Ri+Sj0UbHf26dy92tvq9Cjjh1lTI49RrrUlFRy6ig6dgk2qGy0LXogz6PDKHQyLra4wYS5qhAAAgJ/a0PwtfsP7oRqlgPqbhLHyZEaakI99IOZNqciiRuTiJPS16dfu/936///++hKRcBWlgIarCYlSb0gUAjHhzRLhGHl5EVFog4EKEDI2KjdKE80maiMHE4L6wzL5Ut5JQFEnB6nGUwokPcKG8h4apigZDGHitbTNVekW6G21ZtZYRmGp+d0khJjKUdg7MzaP5V3DMnZ+8r/++5zXta1kOCyAQyCfGqGiNRMgUD8RMAZe8AAFODaAeAiWBzPgVMIxree94nLYb4GBNbgb3HIBqOCUeKYsNRO5AjphFcyAyE8KpF+puqryP/Z//+KRKPRQHXVABJKUbgl49IWAiJEikJEcIvC3pEpnllYTxhUVLE3Noix5QjjBxiIMxTnCOYl/Ylmw0nm1VKep6d8L9QtJfHmbl6n5E+N5EU6jPXhGjByOH/+5Jk3I5Dpj5UGywtMDNCyncxI1QQINNKbT0tgPaM6UzBDkKzF4RHLqlcSaFzOGrGZ9fiU4fvf98vzn/5A7h0BAAALtFl3EfBUBxKSkAYxH3kooWPMETJ5eED8JpoIYwbYY5YbCos4QGWE2B0kuwXs1pQqhop4p/xF//+IesAAAF1h5kESZYimFiAtWGnEo0cGMAat4sqmOghAGkQC8imwjACUFc4dBW6lunMaShKEQG4CiUAq6fVS8SDloJFoGPWpjBSpFM1FVzL9ldOyhymBxp3npjbuWX1GZOUHB9QSx4UwQMRLkxdPuPuio39oW1b0rfg2Ob/qmKuISCQEvXJprV9jlnryk/4K+hxnd6/+TvrWBl+ShEAXV4uoaZUj4RhRk1XLlwPjBaU6kIWrx0TOMgn5fHMcGyRFCicggTJnlA8pzV2DFdNe5ZbLXJZA0PEWpmTd3b1KgAAk3GjpPhiZ2KEyVGHKQy0hP9wlM2LSmVOC+0ojtIqnFnDkGb6Y6AOuLahaErmsddUkstOIy8Jx6vZZdUzBf389Mu8XlfcVTf5//uSZOgAo25W2VHpG/4+QnpnJSY4ktElRm2wWokKkCjA9hlo2zgx4JhcQemkyz51JMNDn3UrDoKiWD4BFq4dk66BikWtyRcAjHAEksacsLicGYGpCTSY0OMI4h6ou9L2zmjdnSo9fMwnrGqAkCSImDjHnDKC+r1f+3////5y0MOoIAAEqSVjJBGWiDCQEMl8CkS1ZEAv9PF9SgGalbnrFaxGLzpS5OYwNJtAKGsExQPjio5DGj5qSOywloXIEOU7UkjUZMFZQkb/Q3oqrrr6UVHmDLs/Xl+elNJM13GkMM5LCTdzamIF3ux8IvBKYObOhueX/466//ji5o7QAANGGE4KUwtaUbSZGKgFCuFPk5GCJSVyHNkpAkECLQLnJpGoJS9u2QgbWEe4xMHmywo4KMY28lOO9v8l////264CFgAAU3Nmxko0Xn2Djv8hizakWosOvBnsuizsvNP0VJCY6ysJkZkaREROwQsvX/kjMKWhI2nmpNVoQSmyHJ3XMKMsRlSNbq+BFu2CxcSzklLaozcQWsdf/KvXBc1FVHEV968fT//7kmTkCMN9LtWbLDREN2MqsyRGYI9VAVlMpRFZBIzpTPSuGK7jlgsmyXZ1s7hmhES4NbUZK1iAEAAADAxIogDIBzMRQr9DzYELflM/oQldJIPHQ4hrFSMyQmXnTRKMJrxuFFEhJAY9HmyIXKINauea93Cn//Kf///dsFwAAC9hkhBx6bMRHBEYGojIA4eZ1VgchiAnBIIYGDoVPxTOq97IH7fUv/Kntayg4kQztNYtY2dRZoT7M4jzVnhDsilsOyODBcjKqIMABT0ulcxMlx6esraGQnm2IlWNfLOMr8yYP9xe8qxdSs92Tae6bp5n5Z62nZmQqFg2q2ZXYvhZXym7P55xzbSRSOLMSNSYkapoGX+TRdhaLsrHi8fZ+yvLRtZcwmIx9BgOMCRJJaJ4tA6gMfJ7isIzwDoSVt5e/LxqLeLyRfdc7+69/////9cAAAqQdHTFkg4gyCGsz4eMcDjLRRHNCwDHxlAGTDK/mDRpR2HYMZFF1B2htDXm47OF2o6qdOqxJIJciFrdW6xN4napGAO/LJHTgs0BInUiCSJsq7H/+5Jk8YAjvVdW0wlDxEUjOlo9JnSSHV1EbbB3CQUP6ImGGVqBMKTAX1Vh/lKKS4rql412+Y4owkoU11Bq9VBO2Z+tJ8nSrlKy0br/vOIkK0qMpbHGTawAAV8JFRU4wRIkh/nunnNfKEAjCpDTS2AREoBCyIOxImTQAM/udmFce3MCnmHSpgsabepLuF6f/38+cu///6ipQhNMykCkIeeHeQAUkVjzGlWGprQE7Cjz9xhg1Hcrv6sVw6anh9/mwsg68Upa6pnAjBK+IHYiWJg6UTrBGDtc65x+nul2sMVqNuZX+1HnUFPnrYQOLkHjVd0KRns1iqYm7o1VQ9JCkyPevf2J3Yp61LGF6rlggAg/8SKMkhZGqiGZk0RXQoBq1nGdlKYlOuHNl0RejRt67Cv2Mq4KWp4VfUg+jr/939T+593/2L9MggABgAAIxUgTDIoNkrA4sJwxlCJEzIipAkqErkjIkLE2zIXqoOiqeHACgmEXxCVfcygjKgHuS4QIWAJo8T9aC8oNGoWUJlp1VPB9EsOqAxF1ZktGu4p1j0yRWum9//uSZOkORDZJ0RtpFiA/AvozPSZUDrU1Sm0wtoDpC2lc9hjgz6pCmhri8zfNTwa+Z7iWkWyLEGfgcx179gVtVXp5aY7//9LGS0L9NtkKAABDgzbov0VOZSWW0GPBHN5MA0rR4iCdt7xpRg4kLP0QskITxy42FsfiaRWFLDl7MMeYPe5qNv/7G3//JKbNHRS0aGAXAVRIyKRIpA2RvN0ZWUGACJgw0BhIWFTFiYGi5gAglw6aWiYL7LyYmzWJ1nMn4K7tbE8CAFKhYzxqcxFnDd4AghiL3LefS7gCRLaWLCWT0jzBcRn136HvPv2C0OoZwAnW4zskbSiSlxwuScgyw2J1PAGdLCFjjF11oPlnrYhSE49UMcYB5BUC0F2WypPEp5wwTpqSMtpegHISJ4g+R7W9si6D5HMCVuyKuJ0VPwApFa/JfI/g/if///pouJ0AAMCoWMzBc12jjZL8ONlMxoKjDYHU3VMAh4KA0wSHjFArGgAgwDgCgTZOXLZ+IAy1JVBWEHABE5MNt09WDhcIGDQC/rLWIu7DTdJO+8sYi7EPw//7kmTtDuQwK9CTmXlWQ8L6M2HmHJAowURtsHhA7owozPSZUpbUuYku1iV+GmvalZLIlYp4kYZ4rWKrCFlgiLazmvdUtdnZwzmQn5Y3BzI1i04zcOxW+FCO8n2fn//kKNQqigcWpHAAAQUSGEI0PkOEJ9DyMDXQRyGgVm8KQMIjKiUmIY/eSQxi9RLR5NRHX9BdfmJGip3KJK1I/X+/66rP//9IbWCoCqJGTDRjxYcMRnIh4ZYGUIcZ4qYw4fHMl4e7RrQUFjysdkxQLw7Ahw5F8fAQBKK4dqJEcBGEQgiGI8sKdeKUviSNBsNUbgvTcEMe3QZ4MMjJFpmkVcKuHD3Dj6iZd1g4mgVuFjyKOtWmiYjNdFv/cQDe3QKbd9erfAY/79e76YhgfxTUYmMQSDPNdSRCxMy6aUoyKpUsLysjxRwgxFIUI5Em/NmH7GmK5awm3l/m+r/+2xe///6dSgAAAnAqKGmFoWAjaS8sMIuqKKhUBKAABKxb0EiZzSu5KNW1QRWBLppLjP+wqlWgxF7HTQQo0sOIQvFExEJopKOGqV7/+5Jk6I7krUlPk4keoD7C+hM9hmQQfJdCbeXlCNSLKMzHmHBUjVYluwkdqFjum87XgXBtX/kLDGpBicmRUfgNjO0KqF59cpiNyl7+/B765Zi2kcz6w4Az7UiFiDJR5MOQ0wGw+sA4qN1ia5pQX0oTdAAAATeHkO1lHGXpNKUyLBwVp2VPtKttDJAkrfwzONVlNxdsdRs9v8hPQFe36f/0/f//+7tIBvfy815ktCyYJRLPoljQEAqfeVYgBg8LaaA70KOBsM2IvJJTFJFP9MOZnsC2zrz49G93Zieq2ErwJgeqqhKhGNcOy2LurUWBsS/worAsznm9lrM4ce+/bas/P/JRn0awIC2hbgB4+dwZNFwtHkO9f/Nn1qAAEmziw0XEI4GS4paE4qH9teyoG5Ywgaep1oNdHY9v/GYfkglyHVs2fX//p6///8z01QACAABKbsYyaursMqYQLoUAEiM7kz6pPAo1lrGsLIxR4kBFLo/xPz6P9wMwpmUtz5tbpHiqmbqpt83RQ62R0rS/uMCPHlgAk4PJEI8qOfcxA/p20FQx//uSZOCKRIct0Bt4YvAzY1pDPSNKDoC7T0y8a8jHi6mcFJggLDUGPdopA9sR+lGBZPGFSVtHZd+Wiz2x/++fWaM323r/P7SJkCM8s4s4s0syUl3BcuKJVHAABagAABK7/24BDQEF62LxWsCkVR+lJGbheGX1Y3Y5TZuSkwUNOMiNff76WP/R//FX///7miqZkAAAGR9xoPCrOdWxhnaZGajpGwoxACIh1IxRUwMgsMjfdGuBV6KYtaViZyYhGCKX7THcJcMHSdQTl5KigZcxIMBCV3JVo2IHBiEJwkFl7JU2xgL/tBjTdbiJCbRXANnzrA6eH9RzRioSDb3WToGlyc0dil/SedhBKvN1Sy5+6hvyqUzJvwnotvPBj7f17H0Fc/efBXf310AfAABLkk6yjggGUDJupFaLchh0FxpOE8WCVa7giq2iMKpLipoXf0qrZkXdv9//Z7v//7hkwkVSQAJTduXwAeX0FcSQTUCONgVDCoCxHDiChBqs60sKfNBKN9EUElDwoPtNoqGpCmhUQBxQ8gaNXzJmyIeUeR9i62MS7v/7kmTqCARVVVRTDzL0N+JqfSXmRBLQ50Jt4S2I1odqqGeNErnEo8mrHV12bBI71v6R/ia+NZfw4E8SQjxzLEW0j4jQSdQ+TQxIbcjyp88YRQCAAAqqChC0DXVcifSs5wFLeyEyXsLas5NQReX5X43IYv9Rf1iFFnx3R1P+f/6P///FQCKoqcxdGaaps10041BPA10ZWjGXk4YZGaGw0/Bm0jCPAAGRFfXhl1AUPhEBRKaZ5hqgG6s0ASLMXdj5qmA1EDESoeDJhjEQWAcZfiXoqKnI5SNTcGciJEQQF1mhqaNydxrScqhhetRx9Zxmy/mTQ0v6RU693Uf5ll59HKg2dr005NAYeQGyCx4hiUmA9HXBMBs3ie1kVZ1HwlbuNFriq3i7+Iq0t/nWT+5XeeXlv77uEozIBBSguoleUxlnUfilIphOh0O8UgcgRzjONQJ11EhS61M9V2xoA0JLrDRQAIpCCblMnRU58j7Vf+////9VAAAalYYF10xppCxEcATmFB5EOmDBI1VAoxWOAg4GBYsDsKKUXFmUJdUPJUab8MD/+5Jk4YAjk0TX0eZEJjHjKpcl5jSWcVE6LeUPyO+Madz2GSorGwsAphoEaJeJCu2ZmDiet6pGC3symufQ3hxDfHogpxQmS/cYauesjtTQHdJ+JEU6ZaI5KWmFXPK3bltbtR3mGrpfH7OXHvEwtCbm3KqJtM0XSwEB9A1rBcewDXggAABeACqVSSLiclQwzQxEPgZXwouXfR8ZwhiYELcq2LR2M7Qi1OiAtFnBNS/v+qr8//1uyQKdYwYIUZIaGLDuATFgAV9CHo2iBBFOgADzOkDDF4HHnTAowsy8Ahktd9fwXFQ9Byd4qlcVkx5JVZY1Ahh9MS4ClYXqrPhIjtRS5GWsKNDCZq8Hj6BEPJiEQyoTWhVEM0TayLcbvYwSajtd2j1nabxgHqSv0opTfvsy83zb3cf/7aGm8m37vqn2AAGAABSED+FFSAZwPlczskjXVV2Sj8biRkAJiECymRyaNaNap2mEWSLdvSryf/2f///+tQAAAlWBG0RprB2ajhGbihgKELFJhIyaMUGJCwcUA4UBzguNQUHGpcWhTmYAAQFU//uSZNaOBF050htvM3A1gwqHDYYMkRizRG09NIjOjOooN5TiiHVc5c1Xg0DEoCYECqFvGw9PNiigS5ZJCY5EmWSCIQ09VdbE9RMGo3JdqMxQgmEByUVYdOk0UTHNqwlCSycJ0CWc9wq5JZWWzrchlOtFU+6tUyuzyVurqZnr1W237W6/R20lFEgACVWJd+Gk2jsozUcOKhlzKhVWwdJaFU1Bm5Z+ocTcwKA04cjsx/7//X/rKP///qAKjczGKjTdTCQjXqEmTTiDFJxsgQhAcvBIwDJUnVolxn0fJYNRYvgkQ0tmSy35HYfZZBXDzBJF/NIO9gJGSZHEpLfc3z/UhLTdewnqWVzI4N2lJCbzkGOmLRfHaHx0FbXhJONZ+nxoeMFjQ4ugJXtE4s2pzMhti0Nlw01ShKny8IAABLv4hM1a01XGAoGnDUdScNQgMhJRm0U3RD9wo3hbyTyAAbsQyij+j/+39n//t2JVABKTl2CkmQoZI4nCiVLiRTJ33VWbZl8FbatZqpq3MWR/WKXhqYOkIB8K4P1xdHkpkic0nVbZ9v/7kmTWjoSeV1CbZhaiL8IKYz0oQo/8uUJtPNLAx4iptMSNkCdRZBuX77tp+FfybT5n6xz0zbGRKjS4Ry1tl/Ymo/ibqteO3u99vK+VyGlXF/ylYtTitpIACVJBy1MNJSm8ZSHlR4Pn08xhz6ZZbqlwxFjva9Jv0x7tWrrd/9LZG13/7/T3IAIEGQ0tGjNEnNgLYiXZio3ioCMmh0WiRjYLmJAIYWDBjMDDQAAwcMOQFYIsDQoBxd4eRaI04ACf8OWtMGOdovEemIriyhIGCZJiQxJujFZPLWLOIXCTgZ5EIEljOXJpNiwSDgupS6FAK19MOpGSn65lcZl5Gcok2EMkoA606yyK3rawNn1XVs7Xvcjex9jc3+ptq5W1LdeO4Z06xqse1+Z9cffTL+hAAAHwNiGEshniOSh0C2LBRErFohMBomGjIUH5jbIHaQ4k5wUMvwT13IS0EYaU3MEylLmLiv93+/0f9v/UAAAClECIaifix2DGsDmgKLDTAAWPB0UZqAh8wsVDCAsm7brZQ9FNFuUtU/G+fpcDWGjpLS6QMuf/+5Jk2oxDWTDUmwwzti6hqnMx6RCUvQE4LmGNiPUMKFz0jZjBz1TQ41Rscneh9Xmd6JTLWXfeuQtStrxtSjRhkByZMihsHnnUaOo04+HUvoOwh3JOkLpJMoZ55OVrw4X/L1c/PP5975WqPjX3XHJNNu4Z7VpwEAAub4e4dBgX4nz4mpjVAFq3qqT1ID+wG5ULcNCqidKg+x7cXVx6Eue1ZBot/9VdH/0f/vBUpKiM2COSQPX4PlDAiAHJXIEjo0aGCAAHOSYIRHxDls6VEdK8kB/EmCpaEOJ05p2Q3R+FvLhiEY0VqUiy7uxBhhI10qFtWGhFgryeiS+YBMxsXhR66u3TeSqacSCsCdaX/a8Uid+/tXIYM8znP9/7lP7IZlUfw10R6Xk2JAAAk4EifEnBqGo2MhdVEjw5h1sTFTik2CulQpkplErlxlVu78XpTH+mv5no//T+////vgMAAkpuEBhMgK8bPEU5UTrbKFQweslhiumQvgZZb4qdfoxkKBkaW9ocWNEHK83OnELbVZeE3SNiMirZBjjLYdDA+jMt8kDs//uSZNsOhExI0JtmHpI1AdpnMKZwD5ypRG08zYjNi2jcF5gosmVdnn/uWTbPQMaq9+pl4ZD/hi7TTIfvGZSzPd5PisZo3R/KbSN1mpyGfRm8Sr0zC1v7Xh+D09ogAAKkHmOw2CJP1Oh8gwTBo9qBLVorrabb+KaGphum8URS5VQHzi48ynZC7/7P9W6llBD/QAADjqkWkM2WjjWA71qMpEzBCQxpWMFDB4tUfCoiFAEIKCoFQeXKDAAqiQWBhQAT6jIOBgIVJMw7AihzothUIGks2QR14LMZ4CTITMgB1zW2GUr1LEmi7xhEJgfWXL6Xu5MlkMKZ/ATirUlO6kNxyN0zGWpwNOoVOpuGqsOrvjE5VsRx4JVKq9idcRUjsSWJ97ZpVqM2HG1lROzX/7o6gYbKMRqb4NL/Gt/BvGq8ad34e7/2VlRgYAIERze1XohfBJxh0AFGn20yxBvh7Ibt6yz7XrH5emZMoXZzas/yn/1/8jqnm///s7B1BAAANIhCpZ+7n1sYSTwALkKmJdmYBPK4C5Cw81eYeoeifEYOp4y2Iv/7kmTiiCP9QVO7DzNmNAKqUz0jLBbZET5N4TOIyQxqKJMhQAaT4JQXxOKJ8MhII8Q5+YI4joUpmGC2CelzYhXRSGhFkS2YMteUcSC+a3EuZ4Y1Ctpmur3CWjCyUeathu1uS1o4sWGOe2oFz6+rfPxVfTo4l8lDO2Qtn9vvfVsmLtWeuvgBTgzEtOZrYIAABHINiTi8tGClgWWMHjf25qNRLDQSqJLBj8+pFEDOedagJ16NXf/87/qfypLiLR/8qAY00wcuZrKNJlNoBhM8QjlDSiikC4gUFh2/Xd+V0U4xpkrS3RIEB4wQ4a50HCATivGMPSZw+ELDdo6HWazaui9KpNFWtIuSK/sxkLVSMeszjHYID53hqVbbJCf3VsCRta48Eo04khVudBZDHeFD6MRHWrOduvVXnUqIV6LJQ26MJMIiUzPV2n1VlVBE5NACMAACV+BLCZxEJESYuDzJkNvfLZYtvRSagKPRUuLrKqozvPkb+Ks1AVcnv9X//onuhQQAAAAqFVcHjmWMZahkjH1AYBzIyYZK9ZDDyzlNH1No5Mr/+5Jk0wYEg0lTMy9c1jNDKqcww1aRwU9ObLyzQMeP6yjDCdIDHGg1kTv2YfIiCUoMZSgFsBbKhLlWojtBbqxHK9tQoMQxFS5ixmcOhCFYxsbnllU/hrskMR7E2sxUKYWx+wK1VuF61fMQUqiAssqKQzY6nWzVJ5Pq58L9zCQtsUtn0izNT7cMcYzQzeaWABAAABOwEvl0zHhTaAydqTAXVHJU0EPYa2KmJwjWYISCKlCHW+Y3iB0hiSg7p7volHf5MABkE5uoaAwAsEZSIJYaqke6K64876/kOMMwShqyV9ULqSH4/M0stYpF6aGsHCZpR4zcMRkDlmiEeSUPIgSNkYVMxf+w03XsVTnGGRZxybSS/32m8VKqhhpWKP8OBZio7vaiuoCBdVFNjfIj9LkphU+5NtKIJrTVrnQvbqy+UgAINwCZEQlZAbOojizA2CqqYvBO0o7OH2U/r0Uf6i3dV9pqHRbYZWbmYCvuoJ17UZzVr/0KAAAKlJAYxk3MEITBUsKDhw4eNUwsEBBkkErWNBYRFSrFSpk6Mh0OzFmL22Vc//uSZNAChF9LVDsvHNAzozq6MMNij9VFV0ykdsjRDKpMlqVAAUhEVM6H30oUq0oIMcKSMFboEbppqA62CXSnEpeSWvqymBOTNJNExJOk4AK3H3wOSjqpGNDBrymMmMz/RoT7X5bd+um1//OEL3tR6T4rZdbnirVq7seK2oI06x7FoXyrfF1qUAJIGAklANU2leFQvlfo5E8Bu/9ODulv8rFox6c/xgUgOPfUzNuPJFnRV9Wojuzf06P9QPhUEbs8WsN5DNHzPCYPCkLBcgIQeXgIDIKkJLwYFAaoFrl0lLzBB2JrAMbHHY8ZDgK3YZh0u60VhT8rSL9OkOgJRhXcSKlARUqKsyxyAisjsMWgu6w8dPYDXO+1S5UOWIsePA3F1JH0jZ7ZZagbJ3WcbxudfXW1vXKjHIUBTZ4mtzZ6o+tM8xJZIM2VJBkAAcCFJ9QPczgVgaYvXTLVK+2/zZq18PvH4wGGiPUTrUSydJtykqrJ9DP/1QfXQz/66gCKoqZ+JHNFpmoQYIGnELZjY0ZCJmrCxENkROIRUywPTgLrgIDUrf/7kmTVjgSEP1KbeEtiMuMqujEiaBHU4URNPXhAxRYrKJKKSKKCgqiC4gxVfAOAgcUtcEg5lSRbNRkEcaJStS5Zy+nhrQMtR+WHPU68UmJZLHfajE5u5SjQoMH41h9XzuJUwZOOp0kRez6zHhnIaAgR4hDI7KwkrQZ3OPVNt+1CER0yN5Pr3FvR/0SaUkAEAAUZR1ymFcrRmolsKxMYAj22e025ZSQcTfUahnP287U6EBBDSNlGjv9b/u//T/lHHA/Lg2KDJbszhSMJKAoGHkKI9ymUAQZCmWhRlY8MjwOZy1TEEHF2hUERxZyzOTQWkMjM/Q0NtCRUSGbEnkqVQNS1RZZSTT9TD6xV/lK7TstvCXYklvlDefdCSoTSMbFJOcqZMMLBWZSSSJDNyL4i694m8g1/b3yvIXDxw41U0oQ3Jb/9QzOqubUlsuq1TpwKKG/b1cZgbnF4i7FAAAAAICWm4YrNBgJojkLato2ge9qMaBm3o0N5ghQXSSsHp7UCf16OkSRMZ9n//v/oAABSckIBTH3JDBYUnHCAGcCwY6ohCtT/+5Jk0o4EhEpQC2wWljSienc9iyiS+SNATaR6yMSIKnT0jKBhkvBJJC8MtdOMS+KwBTzC74ZqS2pL2dNIciFckcfoJ+vZpbUkn4k9SC9WmkSd7AnF1rXTbupe0z+1RmZBDUzIjUALptlgSZ9phEIueq9x+BQfY8otMEIhZROMe2QZ0I5UbGXGc76TDqbKEorIEIJlDAoZJ5Zd3ZheCZtMACKAAKP0dqRdFEUh9RT7xUATGup2Faj7DURWE3OmcY+Mbt+PYh/LuV/X/kyBpFKr1/xpoAGLaMCDzHjwDNBh1EMFxlYKOkAIAgEShjC+xr66b9sTTOVQLZZSR6n2rgkLLxULWF7NxaekAwFSxMqGm8Yo2zo/E4IYXIxFGhGyVaakfRHDR5pCYJ1owWgR3FGcDUk4whO9h3duB4Gs/RqPtHiZIbHmvqSzeSySu/9HeT5+3jSX9d+ooBBcABK+/25qJeVKqho1HeCRV7NFOS0tkGBmiNOT06dKru76v/5Vyuj//0eWfooAAZXMY+MZ2YkmKwEafPxtUImqwcYNDhCHwAFS//uQZMqOBJVYUxtGTlQz4bqKPYYmEHyxRG3hKci4hqqoF6Qo7YFLOHpD9p6sKZ2ZVLlIXBbuom1cBCS8oCj6wrqqVlkEBbC2AwC7DX6zVYciced57kaqxgGAQBokEUxSPYwkt0SqTS9PiqZkqZu5Mzc6EM6sK2NY6dXC09isvOvKNaQCkEjOeLnl+7dX729Gafrv8/9AGCCAiRr/BiYMp3GSrEiGg7fpEkk2Fw1yDuHvJA0dTGBcr34Qs95Eii+7V///V89///r2Fi4PgAaNE9jtVMygYMhej9T8SchgMAx+YkCp+JpgrFFARDMFCTvvamSmeqxWlwUz01ktkL2WI6sug9tkV3YbO7cLZPdsN42sCqmfMmEDI6RkKYkeKQoRFjTUjbLzRdOOzUNUgTmfgo0mpz572Bw6KD3LVH0xdPkU+H3tblGO03UYy8lruAgY0//975wbQABycm10JU6yZJQajITDAjMAjej1mqt78acBavYFQRJly7jff8L6Mos+r6dX//R//dovAIACUnKWAwNXnbFBypAGNc3pYUud/V6t//uSZMyOBGsy0BOZSnI1gsp6DeIMEXDZQE2kuIjKiamM9gji0ZHG6FklqTom2iFZESAsESBpaig2biyRItSMmyBMLhhyiHWEyebEIkCARgWPxMWj1BimxNiCSEPCJIsTMCRxHNQoohtvkVl1dPHeb0VGL/zsRpbxqIe97bU/N1AIDMASEFBJAdyMIAilVUD/hs+Vi5XGarrndL//r6//Xx+S//////67/yEq67STn684MEUwWOgABTkiCYCrDABAW1Fvpai0oKUsXO+DoL8fcKoFhkqHRxMjQvg84N1JrFVfCXM6clNUF2j8K7jMdDk3M1PSUJK0gw/5932soY7k7uLAAyEGGL+vMxv+KMRfLKm7epZ/a2qXo8gBVoXz/+e2c9pMLShTvvfYjI99zMMkAP8sgEAAFNwWDJOSh6J69ZLL6P5AzZF7z3LYKS7rkNLr/r6vKKd3Zh3Ss2uEXzjnjbuPWWs/UEIAAFO8hNB9ZuLjtJvqniYchBaRNJksbQ7g7NAgvNnbY1GtRBVSB34pWbxCStGay7TNIQ6ihpb+LvQzWv/7kmTLAAOdMNQ7SRvmNOq66iAij4/lQVTsMM2YzIgqTBYMKjest3J2SKzxpaqv1/OMWUUQj7D1iu6bIZfN1YVkU0FBSRnbq9ysrnYnCYsP/dAkC7UMzCijbzqbujez1PFRe5N1CGfOIiM1C39s0Rq9zWfcuvuR/72sy8Pzs5Z++OEvqanDkQXAApBAARKbmGqcYUgtBbmqeJFLl8MYyBTDDaHeryxa7+z9NXKEMyti/wuSDmRr9pUCnIslIk7jHASgvMgBUBfxprkQkBQJExF5WMullbi6josy2+rJGVbQnjdLmq25XWqoDgdQ3FDkFGaAr4WZr04GBScRUQTjF4k9MBR6RUVfgnXyb+RefL8H9TXm60fZ7XzvX17MAvK0NW7H48ZtZk0n6hM7PHJHwZDt5/jwRQXTh7uENgECALu44ojBNNsb01OOeJ8k7llIlnMbpGjpWRa/+3/3/t+tU/9/5qM0hUvMtxJ4V/0VAAABUcAEVTjhDQlxIwZocICoMFg4YignSnQBjrsNs5SSN6flz9swftxkgB0C9Lhqpumkav3/+5Jk3IIE+lhTGyw2kC7hCw0N4zCQeT1a7DzL2MYgK1xhiThTZQ0QBIVFIvGtopPG4daK2oXBBUGmFDMNiL/2skM/K7BfBM0HwxNlKpGe6S0iMuAwKyZExAsK5u12v5t6ZXsie0GJ7CpNSNsVEQIiBQyMty39le3hZyPCLOS8eFmX2IRz/EAIcGABUwdAAAQQAAUnKFKLMLsr5BwBuUACEERUMlmpKhdpqSPuyvQ5FCfxZo4ZINR/6rNP/yINplCOmbwURgjHAiqHBQ4WCtZdkBQ3iHh0PbZAnHRT0SdyQuCwwQkGSQHALXGTtLaQ7acaQbw5RLkNryjbjP1Eq7YtKhDHMw7UPUs415lp4DFU7KoVrVRTUFJQaQixji6yxyo/YtjV25gcz2EXY8kDPeNTOF/Wyaw8vrovr33PnznylIZnmEMeZj4ruwACAACnYDA+Q0Q6eUwGGKcLrjVU23BrGMaLl6Zu5iq8T8XxRAZZTR3/+/dT//JKAAABihoVNn0YkIRCk2JERhl0g4Q35okSaKlzuxVjZEIhl+3wZ3MQGzgl//uSZNmOBPFXVBtMHqIvwUsNPSIEkX1DUk0weoC6jGuo9KAaCs1kcNPgxa2sVkoYHMQFZNEo3hLVGnwqXKSNMNqKLIX2rtyPWeVoTSWlpWKOllTCcQ/NkixwoELMlpp7aJe5zgXB5vLpYT5wjfW1vKjKlDNoRbWa1UfVOrsl1uJGIEp0EiNQSETTRvsAAgwA5dAIwUHTgLATY+4cdyw0Q5pt0f4r6KSUstnajuyCYdgwe1E4Jk2/oa/dtSgAuIIDRIjoJwQ+EmIeeKIAiAiYAAiDJNVKkLWGS51RoO8DKaR0Im7EOFu1stLgKTxaTt8FyAYKXc06UMjC1NyzVNojxLM7yZgvbGoCFxLi2qGDfjtfKSlW6lDeSto3+59gc77zwnmj5LNnBPcI6McIikNC4l4zuhZx9y1Fn44DCVYRGW4qYARQBOKzceNwgBGyJCd7eWEIkwzjR71Vrnc0MSx5deSASpjJQsOrq+vnyXT7B32vSykAAAy0qiDRoQStOk+MMhMggMgFMCiHAfm9IPOREVmZNNKBrW13RtNNxfYaXFk9yP/7kmTUDoSSU1SbSS8QL8M6syTCaJCcyU5tPNbAyI9q5MehSGvo4hXXtfhUxQiyOSmFa0jF5hvYUA9XZb1VzmrB9DtWr4u6tWdks27JgeKCetqoLCP4EWkXytv6NCjQwCmsgqUyKTIWtATjoW+lA5hxegzQuvPBIRLhllsSy9sOpNlmwYfRG0JQ4FmkBo1ZZGhhHxC72bSGTKpVAJO80hqk3cm0ujPm//QACS5sqsPJwE8PQgEQADHEMwSEAy4UChgFlCOcc0yZX0razDsYp3qsqpOsJFzFgtCKB01PI09YzkcUasntOnF7Id/nWwRTrpezBbOh3UVF6sZzuXc061ZKRb8Wf3KM942vgu7Pvp5fr1ozSTKI+vVv0eXwGgAggYIQrE10ilFo/Gz49Jk9p8DfMnS57cOIAC2ADiFkAVhpzio09oOiTZX/6v/////2SdUAFZQCkm5ZKNfNggzCzqdX8CrUlLlO8vivDApFmkQsld9pm45BSZqYkie5O4fPY6YgRKjSFNdNyUIkOEKpzaeJraYKPaWL1jL4En8658u9z7//+5Jk1ozECE9Tm0wVsjMjOlA9K3YOeMlQbTCyyM0JaYzGDHix+GGdpPvpr9VvrtsZl9l7Pd3730xsBgAAgCC4DbCjJoJiedkOLiXon7k7gVL6K5tVK1JP46F3JXKhpg+zWWzkUOZ3L105FplgrnbNez//////4pKwAEpu0dGBbgCD0gfRNBmSTCRKV6WLLUzYa2v1ieyuP5BLywKnikyvXoLa8rluNCSm1V40lt99cqXjR6Lcd6Um0khW1UEkEMqaNubKeSvYzUmYHui65PsGJJeTzU5IDrVNwR1OVSxOeMTX9xgg25R8o//Yx2K62US99KtuMR150nI4E6PjPxJjwhFF0adAYbIwlHMeQoqtZrsALromDRQUh4oOg7bPHmI4nRFSHjLNjtY7BCjbP/xSReajQEacE8Y0WDdrR0iZtV//////8WUAAFKYVPn5gGetAlGY9yYEqGPEABpwgARCECYEIxckAPUsM4DpPk2VYsVf19lotaYi/kqdFsCzm7y2XrVbimLTuCo67635VLD4SyzL8Zgftt1Uu6yWV/LsKZ5D//uSZOeAozYqV1MMMyY9ozpHPSaCkbFfVuwxLxEGjWiNhg1yPj8j+IUxWgtPwLl5jrFWaZLDzu8kO3t+BT1ubpvzBn7aeM9de8M5aUF6MCX7aTX7qfGEfoHq4JaLwAOBCPCEqGgtRpLyxGAVRNurRRkg+GK8rUCu4lY42Qiv92MQljbjLbhM+x0GI+b0IGPJoPfO2P5h+cb5aseBBcBBSTlqfrbpmL+KsTzIqIIYeXarVxx/ZtL3rbHh89J8OK2mvpnESmc0Kuy5V2XyO603twQOmian+nNdUFFMkkdUyzPUha5jq6p5e2ZNE+9auE+G/4LqJ6+Xb+qvvflDLuO6v2f4dtLuNxctTzrMgF0+Q1CCxlZDQMAoLgiCIoIuqsI8EJxtYxTmw2KP8HEM/pJXWWxLe6y+VqR//0eU9ioAAAHUGLY1ZGdCRhzCb7Ym+HSLRZgyYhNZNTBBCbEgcGBDQmSpeMEQNKoD5JqMBpOrHYdZYSkvDgIAzVpTkt0d92Wc4w4aSp4O/KoZhNemvQeMyB/GmxWRVNUNLHU9FjwNS0spov/7kmTsgOSyV1KbTB5CO+TKIWGHXA3lX19MmRFQx4ypjPWYiqT5+NAqCXcSksYjdM7dRsguyEwHevWXEB841j2hwr6u561XGMYrbM2s53bFvFUbukala18D/X+PikKDtXtj+BEc2/SGP2tx35X8FdEohHQwX2pZobaLYOM431baxn41qAqBAKgIZLltkbUQuexaKsgoFmsAoxRQor8kS/8qnOJto3ipFECg+oTF9tns9f/T9vrf//6z5oFhhLOq5zUq4xgvP05zOicIJzEQQwgPMCCwIOjAODhhM6MrSEQHOBcGoTdzdTN0VNk0HnZQ3BbCR5lxYRES+aU/kdYIrFG4aME1AVBncw7UIhbiN6ggMQiMfRHgzyOJSye9NUzdi3Uis34s9j/7n6oNOD3J47EN2nrmIffZKkiaXJmnl9JOymGMUqWh6y/kW8F7BtrEKm/5Hx4Yp979rn6W6aT7te+9tlYms5v8rySeatj0xrGrf//x5F0m3DXp9x1MtFFWLv4x86hZgbAKMAEMUMCQTZkCcSmItiwVIvl8l99V/H/xWb//+5Jk8Y4GMV1RG3h78jUkOsokYk6ZiXlATenxwJ+X7Chwqert/mrb8SgZJf/9DPIVAAgACBaEZM6qo1AEBLzIKgwmREkci8ZMFN8MTAAANYd4J9gDxNLjo+RTOhD0QeyeN+w9O0kxTBQwiqw1WYcO9aiJNbFKOdicBuwwtaqyjA2Fl7MebrHbb70zwOmvdyIS1+QWKCdjaCAUGkFTUpoM8sKIunbj85Y1N2Z3BrCsdP+OpmA4YD99ZHj/IUlQET/fr174yQWWs+m/2tktRXO5ty6cvv9PfL940ut33O6kwj4eTXMt9UwvYtBbZKEC+qlk84OAD7G65C2Kghj9+arm5a80fn3WoN8vomtflx/9zznDlZj0+T9PlxIBAAFSEDQuNC4T8W6UzXwvFdBAAYOzeFRNYjWJiKRWJnVzeY0sPvvGIdoPKlxcbb3KXGCnIduNLIALZLOSrVPGrsjhot2LPkEuYY2K+aKjHikhwLvt2GgAEE1j3hQIbrKJPY4N0pq+vx3G5Epf7NA0IY6bTwzdBDi6bZrK3mil98dclJFuK4ZU//uSZLiABd1Y0ktZZHIsZAstJC12FF15Uuw9eoE8rysoyanqlw9NfDK4bBBki55ejJSsxsZ65pA/K/z/o62DKgBoICKXLqOP4D9oDAGr6cU6GOCos7p6DMU2duTpbYZgB0QcNaRueSRWZB6RC/6lqbaC8JgUvzNG/1f/vT/T/bb+Lxn/b/6mf////GA0AgAABEBcwC4QmiIGY5KYMMDiCfgkoBwce/PK9TWIQ0+cdBzlbDDUXLlVGw1Pd1pPUU0LCUIxoIIy4UOLnf1F91EwjBgEvmSwZZZc0u87crC0QWXQmXvrnD7+yp/muFt2bzMAsl5WldMxIwROWUk7SS6Ygd4XpmlawPIkHG2KzWBjXKrgRX8aJK+b4zglY1aaePlINWDp7ArGJjlGzfY5CgnFrWkp2nrRYvmtTU6qL7bWeuqaBGkCUJIlgsuBgKQzbbzQRv7R7zow5ooGVvWtFXrb96Y7ks6ZO5ibAUhl/QgVxuv1/1UjMb8n57spyuaWslkEAFSLGpmGTDSt7sZE42daaKdmNfapv+n/v/x4uDogAEqVuv/7kmSKgAXLWVMzT0eQVUvLfSWnepWFc1LssNzAsY1s6BOxcpmWgMFMccPSKYqOAByKiaVT+ByjltNbIsHSOLdGZGpwzDTJ4lI25zd8hNBwUNR5+3ojcqgnZIGtaWZ3aZDu7zoTlMVZocmc6kuuSrG9D5MlZnqSpPwHKwth+pe3lK2t0TxQPa968SkMhgWrc8el3qtlpGWYOmn7goL+fRZs14tt2eh7Jx2oT8rd6c2Y4HEBLxkwWTpx/xpupEDJvNNkZzcLRQxzzCgAIABSADmhUOQzAQXM/KNp9W/nlQP7Ld9p4qQOpd39f//+/y/7f/knEiTliioAAAAxc5yQAhWmNBGHclgw4oXCCzctKRpEaB4S/1ZnTEFxL2f0zYpkrVYgrQp+URZZMiHZYklSuaY/cGKCvUz1mIwXA8xhsviSvE/X0WY48oMcicEvr0EifW1FpEraHWrzq/3UxxirapGCJzOGTy2ijbTq16nQRODZr0Ux2rL+2Wi9mb1atjzT4xiIzv1cc9cuu80KHbNa0qSB8SU0rkI5ADM7JjTFE57SI6P/+5JkVY4FtFfSG1guQjOF60ooBeCU/TlETTB+QP8aamhmChiJ8/q2lDIw8kSxZZIkcUoESDDU5KHjqrJnoFYiz2aVpypqGUe0qCI79qt/RfmCQixW643ZEh1eWAv/+1+8f5IByBOb+KCSxNVCpMLhDFhVNwfLAAgEFRCAEnZEGcFRNEQv0t2iNcVWMstMQsAEcmkxBbVMYRyiiWRe27Lmj0cQZ6GAAGlgl9mbMpwYgwYaDP+/RERrUkuldFGH/QaUOf+vOM51LcHmfQsBEmUYItMVr9u9UZDkOSaaNMI6M1MgGKrS2/OylEGKPPTPTtzESIq/ARmbWTL2sFl5Hc1VzqrxpAwrTW64UAoAAGMgBzgMexJJSwUqQB43TBu1oROwExBmHpE8kCeHrJwZ7f+DlRmMhARVOI/v/6M3+pStT3I/8oC3i2AiIV9NAABTdQ9MognFASq3yjAeCITQXk9QOmdcudI5qIKgzgduAstYlr6TTsnRAZGJKjwYWRYUrw24LwvxqxatrO+YDZSjIlUDFlfUUUSRnUqoiRpLxt98rgNr//uSZCuOBNhO0xsvTPYuhesqBM1O1LkTPg09dwC+HStogKra1Q23v43RvRjcrabxuFGgpaBXU8sD6yrojKyfe/6sgwa13TqkCIiFqVblGMbsLi6uxUuGSLRP5lZ/SAYWAMfmxdKDBQ0QGikyjgAIleaQ3wzlJ7+f34U3+aaoWqWat5iOY3Vot/X/9f+iPobiCP1kiOJ0IRCBXSagSapQeJeR6ETjFYznKBUiYEqIghrASWCD5VEGlGyJkKrjUfw4epF/QKnRxa0BQLCXUHDQstc0MIA4VAKphrItUgBwAhEXVTYeRlCajkP50HNHmZ+kELZYpdQxSCqN83vkmd7IhKpJ+Dzao6tbnTZtrhkcuoW9R7t1oZKXtIWEoiiUSZJrqupesoBM53G24OVB93dU6ptAm8HwMhqMM1UockBBHSCisAIXfcxpFhH5+zrQsQROhYKDKjxjqOa35N4HMMfma9O/v/mkv/N///wJnQAAAnCAscscIXgFQmcDFlRQMAAA3UR3Gi7mFzVILvXUFQSmbitZCkBiUIgIvM+cWYZL1ykpZP/7kmQbDtSpRNEbTx3CMKNKYiWGRpG5EUZtPRFAypLpCMQWIIlXytDTW0lz9OOIHYrGkxlhzJQhDATRCBcTWklwxL7HVlZEhRZiOp4c7QkBlH2zP66tVqg0Q5wra2JrbnVLu29Jw4lMz7EPfWAkJ1FGIDmdnemHtjj277wOWi/69S/5AAYBwt1dNMyHhkGUK7tK7DtHAKKjCQOpGpig7zn2d2SV7MIXR/BVIUlQcVz/6tP/uAao4GMmDGpQKzj0cBgkUHQMsTXeJNCZUzxklORASyLP2tKIgEKzQtgthbTWH4cE5OQJMywkqdK2q26TjIrglBLFExlqVsQqDfnW8qSJljVVZ6LZ2LUB64mnjzIAgGBGkQmi8g8SC59arUDgszW2seOiF71biqbKI4GVYsLle9zJQsJkAMSJW16F5sU1QZANpbsb/PHJ+PYYJY3OrSj8QFoj2FXt6HFnQ78otQEvFnCr5tDB7ehaGtTOH6AUWeZT9SoQBAAJlY4MGECR6K4FTBXSELoE78gT3MgFE5mkfSbdJ926s8RssxJfysztNdj/+5JkFoTkKj/SuykuIi/EqkE8woYSLOdATWErwM+SqMCUFpD72v2Qpq+gqs8sUj2TUpTMQOp+LWYECA+C1nUagv0J2eTISE15x/WxIhFt+M7soAEBjcjIYcxbomhAolrWGMytYOi1A+HRc3fZokDjlcrHuUuaWQkgyDy2gQ7Zt609wjJaYtNMvs9e4WdJlwRGhtatSI2XUX4TZyRHGOKsJmbzleUlb+oZalfpAAGCVwZTOd5KFwZiBBOCghAeYk0MBzWijXoioYOw4g3RIuXoFQGhGxyRj0mbl/y9sefdg5bEikvhoie6zW3hkUG6ambF0THiiFA19oDlu5Gl+2IAjyJIRA1kT5CbZKsIFREJRENg2zcDUppwXOyS3Ix9jQpxJqO/9Jhav5+sV5oFAodaCZNaDijg6nWqgXEGojbyQjZeOIQMFhCC6LskQhURRBWVRQtnCTUhBipbLcLEhdoGIaaUTljltNdDPukmDketV3oqAAPBCgMo6NKXER0FgyM0Y8QkiC6jNjpAjEJVtkwyQmTFiwpo7bo0gU24DWXCRMVt//uSZBgOxEREUJNMLiIzRJqjGEV2kTFdSG0kuNjRjSlMkZYQLAsoJwY7oUJQGoZEl42Yegd+ZHBQ0BhNiyfByhg0KJLAcv0s1iSOXbFZpFt7ak08LhYVY8w7n4Fg4UE70EI8zD7NuzqIttzKRTzsyRCdyaWxzON7jMyn+UICStw8JupJ6G5p2ZGJ0f86M0EJHMZO9ifv9EZSI6uzI93gKbVYkn1M9uXuuE5+Gf//KFACpBpqyZRKMMNAkF2CISSCgUlRWMOTJQCgjw0Cag8EhiBGHp4TTowannAqaKMe1hF4QtJZvc5iAXXhWEGoXQ/Wmzr9DxKiBA4v8TYYJZnQzEjT+YhUFA6jgxDwhfQOUy/CppOYr/WeQ7kZqc7tXahKuT3/ZiEFJGRFnoRGa2Q53V+QDmDkYxAfnoAAEvedyeB4JFTgrI7tpN0lmqVKkgleMIhBqo9KktUa21XYJjusPeHej/R9//+irf1XdCSlEmpAAEopzkQXIU0/y9hMncM+KTC6hgsCZf7Y0gf2NzTebeY+Z1GyUtRWP398YzuI9zeXN//7kmQaACVKXVlR72R+MmCawwDJAhEBbWdHoNiYuQgrqDEggM03E89ImYzxjtikdOHetMa0yo5EHAy9Pv1IeqiitrGplejzlKY+Uk9j3hMHCyUAXmaQwL5YZdP3UJQ/dtoBggDgHZydGp5FlKt+sWtLG/Zawr8YnZLHflDg8CaJCkR4G26vNzHDb+z16SEEyoorS7B+/KyjacAANUbgjxSQ+TCxx6CzSrHCBWTExnh9Jb9b2bR40KHFvJgN4ncK/8TBJyVAgf///QXfTLLYCIJTkpAhCyDiNoUEI40ynXZP0MOckzQXxClS2sR1xo00k2t4irsvi+3sWpVHElkWMVWKSxmD4u3rExKkGy2mMOFhYF5o/SCmcUaYhKlbTPrPrNK1UcVkL94nm4ja/BgBkjTzraVBAINfdybuCCY9OczPafIP8Z3tnbMZv4PUBAB8lC1kZt6ECCFLImY7wYRKImZO92mWhFx3XYkMfUYIBJxCf9b+ID//b3/+JHOnEP//xRfQAEQAACpWDJDIwclWBVd41K0wHpJtRjBwZY+taUtlXMD/+5JkEAgENFfWuw8dUDUCyuoMyx4QCU1dLDxRwKUuraigH6JFOpXvUFjV11GlkKS5qdpPllV4Ua7WS6GIyoe9hqajTcWUnmcOe91gWYoyxe1N7vl0xiiYLWvHpNVgPR56a1bPb2rMTe8IeUNi+nJv5lk1S7t380d+XT9jzL58L/tesuT+dgQ8QVkwEIISAAZjnAIeErNgoAsRQ+VG6QncjL9BUmr1/FYoBpSY88C5NXWnguHfd4Zb/p/9//+v/pkQAAbvM4YGZwhmHyh5fjHX3AgnthL6P1PTcxnbAX4FjMrOoEMf6SIxEZS1qNpMTHPkfUtFcxQjDQ9bVDCh6oT+sT4z203BOnNygfe+xro0mjOc6xmXBrtsb/0rj2ScCHPhXlMz69S7lWhVYPNJ2VWI73W8T/zGM1UpUezBoVcRoAvIRMAAAalUQw4CuA4NSTyVMjpRPNGh7dWFwXg/IiY7/f/f/f/hmoBqgCIbAAAAJbxhF/FMIwZxDhxGEEdMAQ1WI4qlRK1odRjCCxYKtiOcCJEakaj96rqWK0pFXgr2y981//uSZByCg6pdWWnoFxAyRKr2JaKwkM13W0w9UYDJD+wcMSJAiwPld3fa3nX1Jgo3K2vdTnGCa/5EssAFVuv/IAaNlkS9CN9clmzsKwNl/CIK+2Y23yW9bq7+yKjKK77hgIIAAXv7TnRo4DbBnXeGJd31PMz+CjKzOwXXTKwzqT5g7Q7m/MwX+7jfDfo///////6QAKAAJsFixh0AHiqoPGW00ZIh/B+zJ8XXZxKY5IYIf4KkmlarDvhQmt8kBwA1jpZHskBTIM9RPwMEqc8uLqeKkgWEkfOGqDJVcBaAY0HFM71p6QcvLdFzm1W2AIARbsua6sRghHXtVBUZd00QkZOqNI2a1uRGun3rT+v/KW91MKFEfVKkZK8gSgKB8wYgzWhIgzUtMpfUDtsVY1L5XGgCh1Fekjj4GHPzZs7Bg7w94p6X/8//////9tUACECAACZ1H0rS44k5qCTbKS/iK6d4oDF5l4xaLOLRQ1jA8CSq7NSupSWqgVE4EL+BrUoqT0FuGPZllf42ICtjRwXazX4vRl9wP1t4k+82jHqLG3xLf//7kmQrCIQ1XlbTDz4gOAxLOgUtYo9lZVjsPK/Q8LCs6BSpm51c4CDtdmzUG/9A2RTTsNjDH+yuv+PEzf9H+rOx5rX3HCRqecaXHhcWfU2pY4kbuMgANACAyAPzJWOO1TE+vmJvt9O/6zoQjJ/zP/p/6iKFrP/1K/63///////////////lZEJHuelhvAAAgJRD+suAuQsOicyMUANiUwDewZGk2oTWYthCXQFDF2lw0pIu12BNh2K3G82ZvKMUQ+em5YL+A4nyQGXePm+vDCJdfO/jMJnL4jFqDq9Pa5gMK224WJf1FRb/YIivogkFhJGnfs7E+ZHouvantjDCX6jygKO84Iq3KdpICGAfIl2UcVwCfLFH9SluZiElX80DAAskM/o/+Z+fPFgDAf/7f////KC8t///////////5UsPuQlkLAAAClCA1BR1jhHHgy37gMWDDxw5TeUy9YN1W1gSLQ27AGWh3NypFqJSKnuLFWbGnI7drYSyMKbBhE/jjGhas6YVm72BmkLeWopoGKR6qzuAwAi5VzMVQstSq1EErF3/+5JkLwAEDlhVGy8uFDZEquchh1SOdSVZTDERCNcL6cx2GDhbEgdUTclziupSKqh0h1cuR3ZXO7FmVk1+/tbMz9XVA8Mf/kiLAhJIDS9kkKPyFDaVS/rsv4H5oqNXjx1UxyYAoJC7Pt0f+oPTP3WWO6zAf5H/s//////BviVADAAACpd03Syo9WAHmVqRsRBVgVkdp95Uu2tt2O1YZar09fHNlCnHAkhhEml4H4rEETT2KZmF30S2Nz6ZV1CURdFqmm1DpaiEi2kOCh181/3tfMfLi1W/NeWNuniFbYfXX03dz6t3wOng3/ADXA3mX3vEUAAAgLCVKI58ShucOnLRYQYnkyyDrgJ6Qgl1LZUJuzPa/gkRhudYBs+cqm3dADZp9X/////9FQAAU5JSadIZQbxYKxBSAQev0rEGRGJpRw03SG1fNjg+IPqiFAssrt5AU06+rSEtOOvqNwzPE9k4LQTF4yvey41LUZylarFvppuQVGZllMVCwAphl3tNWLUOuX9zBBnmuO7SJTqOeYOtw8sqcMzDGM2FzVYWKNylSaAA//uSZD0Mg8Y6VJssRaA3gsqNMMOCDxS9Umy9a4jXiqnMlhjoAIAAACAQIkQFi5BH+pSedDgfUw4Py+61YLHrcjlPTA4qkd9IBDDRhATEj/kPb7vb6v/////6QACE71kGeQDwyZFkIURSjRuBx6cwK7FgxwnmwhuGWokEkwxS2vHNpcpZmZ2oQ0l21Mbe5rV2pGBcMjG3HFe1zEVG6tLsWfuKT3TJYyZHskLIXb5tR831U8N7XO/mpg/kTkBL95MLr25sm47fiiKvggnjufGtc72uqAAAICjRbCAbMLDIcrVh7ZijiqOFMJQwNz67J512bdP+7ScCEYcA4ujtKFegj531+3/////+bQAAC5hRwyxS14cWYIx/SDSLwjVktJlDPEaewV+lt33ZhK3EeUa4bXHAMARWejdKntBERlEar0a9blK9iZMVoordRg9Gp4KUr65QvecfunJjefOc3JVDNFab2lmFQGilVq9DsqXJRVbaqVIXW7i85GujcwgT61OOff/R9qbwaXT2wAgABAAVQPRaFKB6ZTCQoecSM8UdMYgD3f/7kmRMjoQGSdMbLC4iNWNKZhnoHBAQ/0pMsRhAxJIqKJMJ4FJ9jVgaqCsp5NpBQhAy96M3wOPpniJgv26WM//1D4QyHKyMBKJmH0KslsDMADh1nBYtE0t8OhOEjk0mKTUHsaIj4REnncZ0XhcNrrTm0ksMtJd+Nu/dpU70tJ2B4ULHPLD5OBASzZtE1U6iWk08eqngxg+AkD9ViqSdQ9Yrgv1kQB8xWtckS1ve3xF79Xcx5NgGFlqHVkjrI9rOUCtJgAANUAJdQwRgTiixCNBruYH7blxazZLfUJVIY3f+20pKNdirZyHf1qZP8E7Q1v/+NQAAFKCRixh6wUU0lFQdEMkRHedINJ5QZftVbcQkz+SgRGYMKlUZUEdZqC9KCZo2AuIsPAV5/iS1oGAYi0egQFngwOltpNC2opY4PaJD9lfdm86uiMlkWU+/uzV3ld7mjmZ0LaYFa77wo15HJUEetRVD/ZDTLtH2U9s8RtZWUKEAAAhQB3bGrWVLQyQMMx9NgyoOBNqiw5qg6zvVnDTm/mZFw8TmTyx0kqOQttQDDZ//+5JkV45T9D7TmwwVsjXi+nc8yFSOrL9SbDEWQN6N6MD2JOjPr9T/8sm8CqgBpOGWJA7yPIMijekOn6TUYeyphvIClViLOEW6dyhbaLakUFyJ+Z9rb1K2q7iLpHLZ5YlwQk4fQXHgmMLCUqdP6EM8PLcH2EplznH5CLf9W1ki9sz3exiDRHETQzC7RGPMqIMSFm6fUeCpNRxhtxxwxy6oCE+RpVhSkxRDgQg8PiqmJy2yW7Re1eHTykKTTeUX/8pxMDZI0rfaT37+/iA6dWTDpzOC7tKyagAAC50tjKgTREjPNCAIICBkKQVB0jOSIIr5pb9TbZ3Yjj9N+WA8CMhQktiUSSNQ8bhlGMnxJEJVh8TG4Skcy0mUgnVSPUb7Wu4DqdG8rhdoUjvjYdrSuv1lRvxlUZRB7Wnz+yv21I+1xQKxTBJ0QiBMDF1qfY0kQPNcHVtR8kSQgl+Go7mJZJo0BgX5LKCZASxOkgGwqbV83eJAORfnz8gDgkkZLJJoLY2MTSDarSwTy6x3sKCTi+wMkW2BWbS0sBDAEjiB6+A4bBUv//uQZGWG8/ov05tPTEA0g0pAMSZaDnzlUu0wVtDVkCkA9I1wcJ2Yqw+R4X06W737USn4U1mA7T/MxpMo3O0CUsl6ESBIN3zRcgjsooNKeLHX23fafXZev9Z7YDuOZn62qoWj0zVv0RihxbYNFVg4A0LKE6jGb4pcBTyWhDAjret8JXHhiChkz400gOIW5QfbUOvJnBAmasULig1WHQu6mhXf8ky/l0MUiT6IjpHB4zlbUJwJd5BEhUAAU3LhpiuHWGsFpOoM4CIO8ZRXEzZS8MMRINR0PkU9RidTpFDKgeg3it7d4IAqmmoYNtEhi7mOyFPESHs/2Lo4WfiKmpHBELN7X0hYgxaotStqnRlcxI/+alRljVLMbO/4HgMOBqrD+bjkFfQhVOwACAOLSIgYMFWIAhM+KSOGtM4cwic8aMChJY7UGk073YXBBA4agRaYsxzuL3+37v/////xQAABTcsByoTMuQMOJMmSCZANBjVFIh3IwgEaHON0PsY8QdSWgn6hYDIZ8U/WImSePFUQeuVhWsSmNwJYl3agmZFM2NW4//uSZHWAI449V9HpRDY0w1pzJSM+D8FLTm08bcjSCqpcl5kCJQwYb2Baa95mp/e8OwW1QmhhGjwtrmZzhrl7Z5dLm09SrZFCrFaheeZkS6HMqJ2uT29b99TMIQdtgGAwg7JcNWD4GxoWNkmJ8PcaRB6eQNrI3AlBIGzJ37D5yBEPAsKANNH7yldAr//qd////xeAAAALm5UJFhwUGK4EpB5zhxRoJpwq5XuDhnDa8vx/3+a5A7ko6w/P0kMSuli8CM0ZQDMlnC4q448dhkRV6o9KhagEjm/eb9KeXY9Xdfr1FysJZhul5VEtRmzKxAs6ZXIoXAbzczSEWp3X3cnb/Wp//v9s4Vv//+UPxrIACBBxi2UJbRVM5TMC5JIbtokBNKO2H0bIJRQWZt0qgljNSDhwy6T86RUdQWThHR0C3//If///5ICkBCAEnLpQglUFFDvYFEKyA4FO2WaS3KoXwj0o10tHCteEQpOfgfsJwu41q+vI0BsEZ4upgdiq0pr1t7zaHfyZeSOnVqqeho+66rgfUcb4yIg9a2b+oOqfnoQppP/7kmSIACPZVtQ7LB0yOCN6cz0jWA6hX1tMMQtY5Asp6PSNYth89VMrdNPN7J5yKs1pVd089K87XN2XZNAlAChR9wjrbQsT6JOuy2Bnl8NCNV4YJU+IGk5mlo5pb4ix55HMG0CAlAqnHTUyEf/uMf+z///5+qoLABKTlzGCZZiEDjJ9iI6hzDH3flbjlSBcbrODLpR2gozNJN9MEMYNhdvOzEYUMQqqJAQgNql5xGBCnBdqglQKEFl5NRsA3j/ejWLnCP6niulpntyqDKyBcFb5flP7yFEIkK0iB3VE9yVG2IEkAACAAS8OPlMH1DHmRp8+wZUMaXbZVmnQWYTaZczU4nPOQqlYdBAw0KHaWdRKZvq+3+5H///zkhoAACVnHCBW42ADcHEZJsqMoSEVWdAe2Gk0IPKYuC69HAWNGBmKRNK9FE+RrpHHQRKWcWRpU9o5zOCsqqCw0HgoF3Oq33cf0hBvjG02jWKrlaA8kOz4TqC5XqvqpmarWvW+9Igm55qMx56+VHjf7p3f99BDkh+8wGAJAAAACPYcWh1V798TKIf/+5JklgADZldWuwkbtDiCqoo9I1gO4QFObL0LiN6UqrT0iOgEwkZY2VNNxw7EbNfGS5h1y7qZG6315oSqli9aov/h3k84d/v////bAQAAUm6WCE4QdeoUg4Jir9QSsOXCrMwYDgOKx/Wqyf6yMCxUiKl1zpbYCglvsP6n1sSi0dKI42F9ZtsXtLYtBdypRnGYsaYuriwKClMUfRjte6IzyVoIK8QVq1jN1T2E3Z1zkSO27h3S+JOpzDTAIKGAAkwQSUkTDJqDgtWDsuLco2DpVJqUAhJEv1eAdVrTqYUNK0qlajM3UYwFCJVDRZDYnJf/o////EXKwAAASvFVBs44phXYFrFgsWeYe3wcCEGA013oJfemep22uSBmkart5B8Sd+IOm/1VnTgOXDsfmSyMRCcTiKJOQrEgmiRa6ez8mHyQt51XGI5RIOoJSPqcGZtye31VjKacrqh1d/N3zX2//1RaUWmypsqJ7mFRUhuiFpMGCWJgJyYEUqhYCedqojVx5sFVrwgonUIycQ3Qji4ySCHB4IlN2Yt6hjkT0nxg+Eiq//uSZKsIw4s8VTssKvY5w7pzMMVajqldTOyktojjECjA9iFgBaN0KgAAld5IIkGGZiKJpAQDsqIOI0+ShEiLOyY/0pAOdpJ7DUqHm8oEbEbzuN0nRcUkDMWXN3RVOy2Mzm0FCcIhPbno3RYlN3k9rqEaNl3gZ8QHxEQ03UsuXP19137rX616Vj1cMR9+nqsYDM76CTSqf1aqnGvvjMAgAAHCjEEAA7eGAblCIiicFY/XsTReJRqAMcGy18PSKRLcnM3vqwytRhoSMKaMXt3Nl//8T///+7diAJ3s+NEnP+TN2BETgCBSYOxsuMPGyYe+RipZAJwt71qhFYbnucpxzHkvm0X4XFLxgHc+mBQODElzRT1V0k4bHEcoLi71b3ppxej7yGeU9dLL6GVTIwLG6ibtyh6GPk73vHk1XddSzYsIlG4idmhw4JgCEgAAWxRYwS1JLOR0qQzwmhlHDgHhEFomVBt1v54cBhOK5AZvvb22tRpxH4E/7P//80QBChRdII0AAAOBAOZu/nQJRpyCzc08QAxknwChQFDYiBjIAFvncv/7kmS9DgOrPFObD0LiOyKqZzEGcI4Ep0xtPMvA5AZqKJYkMjaGz9OtJYES7h55G/YE60Mu3F1g1tKBPy92p+vE4djcSGh974jbB5o/EWmpCvp4jcokvKG+n6Dxq0URwUMwUjJFqKshSP/3O79h//+33hBYYabfd2XuTcCouwqgAJF2ilQmNB8umyYNihXOuxmxMlAdEhkOJVylWibEbhMI44NBVitP/+3wx//wWYF4VJLAolBcAyzAoI5isFAjYtAGMN8GJkiGRKCN8GBI4zCBkepy/s6jcSVDLSI1hHDAJnMLeqSqFQsnWXNuQ8yz5irshTwvhoR1Tc8kYvrL7xTwAcNCjBSEA4+O+pnye17BVmUEfJ5fkytSTIZPFx3/v/0aUgOe5Iu7zJ3qtYvL/lm710AAAp0NFoGgXIZbHhtWWnw7cJCBx4da7ypBg0vqYmuBlo+1oQ8S8O/5Zez3f/1en///4soAAApwcLOLYBhGFEZS4G2BPAaY95fRMlBLeWg/VC5NMrG0yUXR+xRqmwkEPcyiJwWMJ+dTnI9cj9CIeKb/+5Jkzw6D3j5Rm2weEDTBWoMkyRKPsLNGbTzLyM2NKRzBihgfZNF2eyfV8FLxrNcDEB63rhOxYUzPRh26pGmvS89YdbwFvi+nm5nX6l/CurehE219d8OJPl+e99zsTDnHhqLSnQXA7IjTM6J1gABOQQw5jsaj4CFFGk84jbqphf4BRm6w56jyaG8VtElhBTTWMOOt11avVT/+v0f//oBd2YQvMyUCAhMGBAoBHx8qAQykzRjIo/6LyoWkRmDm6PAvKKWHAXXJnAXuvhkl5FWEWggBGH4UXf+ghtXMNM1XmrCqpH2BSfCvH6mkJ1AQDwqm4naJW0IwQspx6c50xcUlHcrLoyyvQIi7Srufp1UI+rW313ZFdas8jx2apJ0Fq3vULAEACAggAq2zPXmJMAmdONwoU5Ro7z1AnLQ+LCBhgXlRK5CDq6Vbv3/f+j/ks9//+eumUV0AAFKZbZnQx8kywwcHC6MCvxq4jbCDOAnNJUXUyC3mElzfVqIMAmYNVJWVJejeVZ2h0oHAKt4wOzWXBInNPkmF1HDCTo4WZmgSKeMT//uSZN0OBClQ0xsvG/QxYwpjCYgMEG1DTG0kWkDPBms0x6GCQKFB5KsqlLhgdn/476Rq4yv3UCgeNh5M457wCmA2E1LnVaWJfY94oCJUVinRWKJOQJAAFuSDEMHMBLj/aksoTYDRR0icaCpebM1FToJCZ5VcUcWQt39cms7cIhT6K3/6Ef///SAXU9TLoY8Y9N0LTUBwa4DUtMxIRMTSxQAMOETAB4FAI6FrbLpInrAOWoq4K9hE0yNV4tJscbGHIPI5kEYISnLOv1GmmK6TIeNCOAVLX3fVaqbkXdmLyOPSKYjjuwO3KOTsk3HJuMRfDoIR4hCjlByLiySPOkolnVg4uI56KhufWpbfidrm7e/aWm67rv/rbmqJN89d6DDt3/aroOCAsBBKktswySiYcRwQYfbMNVePGUWUGhbNwcxICDlBMhMGVzF31bqf5R/9QHL////vvQoAAEq4YBCnY478Ckh9QbUSDdqLQU4i8AhAXdpDCNJmMNacwx7nfYOjqqVarXmkOSnQrW/zL5UqJh0abGTxgfIIoMgeEEJgDK6gdv/7kmTlDgPaK1ObT0rwNSGK2jzJNJOBJ0Zt4Q3IzAgrqBSMOjSFQXL/fWcW1kRAeTlL28Y6P1sDOf9qzG7HLAqD45BBhpMOhu4kXYlJUFwVAW3WEhKShVDSSWkussAI6IKKSUHxhuUnZUYOerFQcoQkyWofL/MJQImQyQ6Y7bNWs0lyyf9XJ7d6v//S4XYmkMjgFKShBo54CxM2gEHTEyeINLITGRA6AgCMW8NIp8BZd5yJsHVvU0NrQAEwHOijPEVax1GMHEI8SpXKUUgw18W0upzC7DdnGiP0+SVuyesCnJU1st4qhRq1MjVskMOzbWCsUbK6j6kixdXhaj2i51bcG4mD55I1pC9kXLrah0g0igrVigMkntcdI22SxsABJuzGDkxWFIChqrjMTI68ltNv2TDZjLRHexe4QZQowXhKzW7XbG7/+r6q///LRV4nHj4T3wACwRg0yiYjhJvMYkswINTMCfMXocDFYxyLRoCDRmMAjRQGD2kBrE7BkZcwt0ErV02ESCjayprBfdGdlJJEkSNDmC+atzxtLcdlr2pxRaH/+5Jk5A4EGyvSm1hh8DQjaxokI3eReLdEbeXnANaLKkzDCVqGBtfiU+ldDDnM4uxGe1fqzT/sVgiN0tNHr5YjqPLGCAgogwLC7uGxguOc6yh62XWyVMVK33c/Xfb0rYyxtNMONqI+ur54ktgBamE72g+AAUnBhWCkDbOrohkrEtGbMk8pGLPH/mk/iVs5SbZZKil4ZKibwdcaUr9hhrW26C2tvZRV9//9kXtoKew4RFA564pnCwwWOK8DH4sHM6GLoAIcYQewNJ+VIhg4C2Rq7MmEP9HXrRuYU4DrszWHLwug2VgsrcV+quEBxlXT8QumvvLKJmWUsv+/6Sz5gamfGYoupepqYKivp4eg52meq978+FLNmZTNR8Q9qqyq1rqzL/XQdKyMiKODaUEc0IACUpRZwTMMRgELFDsiYYQyR81WM2xb2bSiwIkyrFhlThBU4q+e/1l+70/9VVak/+pwbVPuBRUAABy4kHmU5lNMeLJ4HGBCA4YEGYIwECAILSCJyBcOoEkGGyDILYDbLqdpXB5XaaVztHgMJ4hqw5zmYTvn//uSZOaOROlIz5OYQ3A54rpTMeYmkDUlRm0YWoDahyncl6RKjuBYDfORfQPaVe7Xb2Co53ZpQykQ1B5eSzFSwIZiA2wf25DaW7fK/d2zHtNEnEbzjzRT6+MYZ8Zn0895bW/vZt/2v74huyx4dHiMHDOuszdjN36aigGtp6UOU2WRjyZSPEfadVzy7bJfy5sBy0iv//Ney6y//////////8I+TomUBOiMTMoxzEE02QaN0KD2XcUCGGE0SQAxi4eUAanQ0HF+CQRSmgpeQ8OEwKPA7SWdLxXyyRdSulVy+4wIFAYoyXEWjExIgg+Al6NwUUTDjzloZWY7IopOTE5RE8ASXMGyqIVMHymRfRdYlRsYIdmmGQ2rCMrZ+whHy8aZUnEZnbbfk/heV1/5mbdhfotQj9eSGbntyfn6hlIAEQYpNR4Ifpi7P9NvzN3yXDIuxLpqi8Hb3b5sJCj8rFLB+6zwjijUyH/+rISH/9swAABTuIQ5l2YGNgJ0OCwXgM0EDlpihIKTywwIEHE4ZhlI5MV1WdOuSBl6QVFsmB1HjlT0tv/7kmTdjgRpS1IbTzLwMKo7agwiq9MRXUJtpHqAwpBrHGCaWkh5+Fdl/Z1+G2murmh+LS6L0cVjDhxe/GtRunrC+ks0n2SOnykYeo8VjPEnlCVHd58427/jNR3r0sZdF7G0RiI6fvLV1R0sZ1sPHf3akv3OrAEGAjNxJSOVpYA6Vyng4u87Wr8uzCYmyVWxcAfQzy5uKAKgkPEJxHrdVQqOXd/f///v/RoBLooPqYHMg4BDzPQAyRpAqOZ8cA0KMKHQrYxWWCGjKgChS6cDKSTvHhoKNgT7p7Cjkcl7TwsXMW2XaRGYmslIl5XaVsZIuaQNeHAyKw0DypsjE74FiZAIUCp+0JRGeQStOcNNUugeSqsps56bycWs9Z/2RgICa0RQWa8RpUQQZRrWNeBrnjBFDAzn2vAJKcgxcSzywuHCMSh5QECZenOVpYLtuwJQi1zzoilBYTGWjkVNTalOYt/cz//1bv7NNQACwRAZnEuPNZhEoaCZBXKJUEsBJghgYGWDIQZ6oCRQKCcvEAYhwSyo0u1hBCBvsTEy5GpJ/aQVUGL/+5Jk2Q6EJk5SG0YWojSCqncwR5IRiMtCbeEpwMeHKczEjKreA4NQCx9yFyr2ZEuS2k9deiDG8BwPSAAZavNlZwPjohRGKhSYD/9XDhChs4eMZL9k7TTqdxhiGt79/TWb5qGapCON8+H19ImfPPJjz3neHiT4xER+Z5CUPVzABAABRkgJjhmL+fFValXyE/UqW6ty+rpDA2AxQmJEJF73393TEhemiz+j/+plH/7Uv6AXKQBjBFjVtjQ2ANxNsJNExC5cwhVW8lAmQVuwmc6YhZm6RYUZbhTGAbhfVCaBd085vp0iWwlRtDxO1csyKKFRUJUY55pdgXzjlblYS+Opqv7yvpI8B5bSvgeLvOWfSLl6adMK3SL/I05d9HgIvNvK3H/x6/zz1Frz2oMkwdf//NZkJTWNIpoSWpKUjBdiw0MN8WhLMiUVwMiJOieXgdNV4+vM4rl///Ru5no/8Bj8bCibCzhCoyoBAAAKcg4MJSJrz49+KIZ2QwVJmxGBDxUIcXXMCQDzxV42WvdDd9n9EwJn0tmow66galaq63LzwIIG//uSZNwOBJ5QT5NsHjIzAZqKBwwAkCivRG08zcjVhe00V6UO9iroOI/cktU9SMQGXLdpkbur4cVY8UlovJZVH6qsvjdOkq84nfOKR6PkJPWL0yVRsnkDdHytfZlP2KI3uPeHvtlY8PuwbzjR6hBPYgt2dtan+pz804sYzPuBtAD5AEEyQoMAUK77B6HTsenn7CrRFX00/d63FkLoP0t///rf///mLXtcNFYsk2AXSAMFT01tMMrMxlEAWMKSwkTFvgSGqsMMAGelgKgZrq8Iou1kJMAxlEGB46pkjs8IcHqEr7XQrKrpZqoIbdG8o+mAnQnuzWIMQLqEAMiGhezOWW3cggOXAJmhWfA2Mj0yMVqRjz0fHS0uiVllmMqppyq88no+yy1sw6llN/yOvWEHF655k4l5dSLhpLYrn7y/LH59aRdAtp8FEBxAADwABKconl1DJgpn+4/bL3PCMVjosCitqCQIOZ/JtOECAP+rdoyX/Z28ht/9H/JVAABMmQ7BAUqhAQNIAwabMOoFjQcbSvMKNBoBuBf+s9S4pTcp0pZp6P/7kmTcCgSkPFG7TDaSLeL6+QmCVZOlXUZtsHqIv4wraMCeEn6YRrUvbZhMMI00y/0I5a/8LnKqnT9x+E1IabEFwyPK3u2IamYARdEZvMwH77MKtsqKHctz4G0Nync4ps1BNtXR3tBSBzmiaiyylc3uvn3c2Q6MDMPJ5y6IXC1uXOf09nR/hVzDL6AACAABx4DarY3Ki8G0VFiwIDX08tiUmt+ThC+WqZ0SMB9hIRQfEzG+kSFbwLqPfT/1dQNDoYiTCwARHzTDFtGLanBZgIcBAZgERclmoAGrrV4umHm/W2FAFlwHifmIukyh5nxXHD0pXEYYc/rqHsZyPG8CLThzpg5DcF0Pcm7tvdKmKYsSFM+TiKS6w+tuDIacdKMdG9GsUTEGY5OtnsgQK1jsoDfT/H8/+SJTsVRjduRUt0TWpzkr5ll0xL/+35e54zAAAAAApAN1pIvVRJFYyc80cYQ3+2abmD8PTRpl3K7A+iFEPsv7fr/+Vvr/40OB3lssNyoAAAF2Nkx2NKJixwIy4007HYk6cVIjVHgywNaMyohPHCT/+5Jk0w4EdFZUG0weojKjOsosxTwSBOdMTTzWyM6Z62jzFPIRr2m15RJWJrMHpMvfLXQMKA4ynNGH8tQ0IxJuDatIvStkJVAnZlb/mqj3IBjJ1BLFAnMB/D1WItWqyRGCO6UI5txIGG1ULuDNqkqvhQt53CXceSlK1Yd0uq0P5wwEHdfhGYQIZtfmeaYiD6cDQrJP+Wx5yW954AJECLJwA9S2lqE0ry4Egmxt2cwjqWX3hJ4ASUBYmW4c9vx1V9WIih6f/v//8IlAVynvDJiwsED6cQMIgYbGEH50pQHC6txm4YiDFkzhIItK+cJnLtt+3WzpVOXr9MNGle0DP4PjTMCAdanMufDsRglQ20/0nzk0lLqQLbkFTN9VmkENeHyRjCmZoZSxtc+mm+XySIx91GEkpaJh+t80ktHf3adhqrHIgLH5/l6+/7M0+73/xs6Ju6cX6nuxFV6vD8xkG5dAAAAAACJoARoacqkS5O+1TxaKuw8WHLmrpqCatnXG3vXmWeEBWdhnKGETtPu/1QABslCyWpl8UGFisaYCxiE6mFjw//uSZM+OBLpF0ptvHjIwxosKJGV8kn1bTG2k2kC8Cuq0FiAodXApgFCGJ5hiDT3FVGJAWglsUHVBi96hCHjPkwIYGjRYDACaDjjUkiBIO8JEUIRA0baeWA5ZyRk0NMvhYRhELqAek2YVLDse4sMdsSbknlSjaO2RrjOCu1LaVOl9NaDDphrUqBzmsXEnng6rl5P6+3zrWs5tNsiDQAJAIFRIum0VcRxp1lxVutNhKAAAZ2DWZi8DuqZoKmivjfZZ1HHutIyG0CYBq+pAqKWO+d6qve9lqGFdjd+N6AE41s00WN+FQcEGSKpyqAYRlEbkYYKigAKJZkIcBAllA4iAxhUAMlpRlwEA4hdlKZEtYUyBfZTaukmrExQ6kVFAjTnHizomAqwcjvLIh5lCA6MvLGJVBUFnNIBrUY8cZXRirwMGUBZDgFDz0DTcVEOKfOtm9i5QqP2v/nr9qsnk8v7rNfsMxPoO9lPlzV9l89af/t4pCgCQCSqKPHcUJXdBOdMo0C6Ab1IiWnJc5bVgCsa7zxXz6v9Vixk8llAt3fTv9P/////7kmTJDgT0OFATmnnwLYMqZTHmKJLE/UBt4SvIyAxqXPSg2v/1qgAAC3U0TdGzxlT1iDB6zrIDN+A0eZUcXDQkCweGlJM4UHVEw9orBiUQyVeKZymzKWHqpNOcROddycTS7ENPC+0tdJ6l2OTA8VJQgilYtalbJdVxzaBCKvK9XRWULXjl7pUoXbkEdy0oOvk3DRt2VjWXLJzq/3KfbTsPGvvWG+/oafdxvvdtswmAAVRxLFcIp4sIMFHj5VERGSEJEJWDONrIzz01x8+yzTa+2YIIb3te9W6r6ez/9ono////kAACldSEIKLTqmTvgSVCaUOdPY5M6Y8O15AeXaQk0a/3xnnSlbX3tYQ1eH4RDxVDJsK8VspFfOk2ksh92G3lUFKBv5I5kTkoGjEOqiKoUScrS3FVJWusITUcxe6u9qxIwMbWqMODmvhmaZ9fpGWDI6bVyOoDIHXVTI3JgmR5wKKUnI9W4ZDEGxAEUOVRkApJ2iMuwRIEibaHvhWybOMM3hywNNtekwBTKKP2Exp6fEjCKsx+79HyTad////CpGr/+5JkvYyEQUNRG0weIjTiulM9IzwRfUdGbSR4gMWHalwmGCoAAYbc4EJEyA5ljObnBlzOTejKloxsKMRHjG6WUA6DCIW+CFhgBkivXLEUoNNFQhrthjkIMDK5ESx1L5DBcAwA20YijQ0ADXmlMKhxwH6Jb5U9ssMPJxCG6EdtGCIVZ+p4H3XHZj5dAn21I8ZvR2eaciknJcULlUsZkoGDeqQ/dV76x5lrDZfXGL2z+i6AABLfiRrSUNKn4SZChsmHxCGhg02niWwOExKKCDsNtXWvrgdqbgp35Wkyz6P+qqLVf//+9J3Q6ZQ0ZyqBDKMRoUZQUEubrJiFsEiC3IyOiA2UidL47Q7hpJ8uZvrtOkEVpxos8ClYCwOK9OduVWPXmM9c47xHK/b6DlmDOYCMqqOWfFRkTVTrBqAhgzNWGHMkPWbHaPq0RvP9on+c15G/27y7n1N+8z3YmaxrI78MPycHmkGAitpbKHRgQsdJHn9jlDuin6m+6wehUqRQWXAw+ij9v6P/7/X///++AAGhELGUoZvsiBmEO9DMiU2ZBNDa//uSZL8OpG4uT5N5YnIzwqpjPSg2DvC3SG08bYi/Cqmc9gzwwMVBcVMfFlSBCGsVTgHARdycVKjatggBVAG8WFXJ0IIF6EUC9E8MsUk4rRU4HUk3xY1QuC7D+LCQAb6ej3SzUdipbWtaV8dzZ4l4cs0JjC8kjBzqZlGtmf6106JV8Y3mbZ29f2Xd9APYmkT+W5gX3P02fwhqvdm0IISbsEConioOz7MdK7AVPMcXlLIIGr1CdXnKWTLhgGIa7sND2H5BTWyJsPz3+n89///eBaXRr4WayzGSEpVXzMRY54WONBjGQsMQBpRBg8eSK6DgtfFCosoHLZQdDmF1lTCMDOkQwrFORtiqJhD8qbXImwtptt951yJS2OJPtG1M0YobaezuNX4wAY6DYlYmRQFZMRtrh8REINE9RqNtxpWQ1yKFPauqhPx+y2moPJjw2bGKRa9kikxqufqRfgYrQfFgDAQABKYgbCQGNWMMB0j1ETz5DbTrN2GyUEwMIUhlpNh4q9U42R7mo3+i///b//Yv9FUAAAqsYAmwZAtYYQ2PHjKTDv/7kmTJjgRrMNATbzRWMoIacwWICJH00TxN4SvAxoWp6GekwjNDSijHAV/GAIlkVqpeJmvcrqjjMByOHHRlEHXoSIAlA/a9k4IaaSut+5QITwmisRSMpVlYG4ExJXgxEo3ZLZisQio7eqxVaGQkcTQbqIUULiNFV78IsiJD00RSXud/PI/+Z2Qurl+eZfAMlBwhgEwOvfd2v0ACsAABT0Hc1hvValZHFWspS5F4SMm2ERoETiKvzM5ERr4MdAAC0zR/S7zSv5D/k738o7r/y4NCMOM9TWJwIiPEaIjhj2xVSlAsONjQpbrNRJarZa3BwEq3SWAa4sgtA1xw1C1hGWNjUzhqDkxCIEYd54Ggx1bS9IeijWzMJvFZy+6zmhtfuxRiomBQ4KxCbbNkhGRlGdLvJlJqRZnsINLLXAjHzxoBmrgMGFmCRwubVTsuXJ0NB4HDh9p+SucKxRCeoBKSdAnaodI3VscoLQXh4TyOYblXk7C/YK61tbBLHRUDvaS3Bf127f9f/aZMq7ROAACk/IVmUwuYMwHaHVCpD4xHuQrEZyz/+5Jkx46EM0lRG0wdojXCyoo9IlSRbLFGTWEr0MGK62jAjkrlfbgraWVNXyjM46T8U62rVAapuncTk+C7rSmcmFFtzw847cIuC5IYQdFq9BrmOzqMQ8QMXCAIh7rMqW/CmEi1pwhCyxs2zVGi3ZZbvM2ZHJmKJMM0pIxVnbRINe4GJuf3/kLIw2hDxhBmkTZA6ReCEq/L2iAJCyEAAAUpZkFQBK1WaST3uV+zVOg153Fnngm51hMqXHH////6u7ehBc25atv9H6tIsAAUnKtlChlqYZAKdL2s5ThWgnA7EYBR/DoiaHMD6GXxaVCqcozUKEljm7ffm3BuPDqKASTREBQSTlwxXRvbgjiTOir9nFHCYoSC6NtEvBojRlQyvC1FMUrUMlk7XZROjUG4RilnsoSTnlXEtvlWwtOflD1sF1J7sclKp+ErzkQ5KcGjAHm0oRuaObDmvDk82ElHScAgxBQAAXZKNgVc3EwDG8o4KU7jwFNkoB7b6YENQwFMTBpcvObWfn31OnKpD/Ke3//3VQAAAlYCECibBzOmEIVTjJvM//uSZMqMBFhW1JsPQ2IyocstBeM3knlzWmwxK9DHBqw0NiSIhdWCJNyiLTW1Y8lA0OGmwReIQ5QxJVF26zQFwSdrUUSOXSwenmYrPRVnMCcp6JxIFfRgDNHPh6RW7xiXzFxDfeyKodo1QprR65atA+9H1SjiGVljs7yTlUZItTLRk2iWTW4upkIgQUz13b2X/yldcMtC67Qxr4kllABAAAJwUoxx+yRMIXYTJ9aczcqzWk8ew2vJUlvLeMAJSx1ElD0oWnpJfu/qvRxnv//9wBkIQZObElQczOsEFQZnV4MGPZJkNFjn8W40g5xLoRiOsR3B+KYU6DPNJt6XQkDcLePQ/Zl29nD8OpDWSPOpYJDhQGlAc5pR8UoU1TyNVAhGxezSJNCdIFhd9bcm1yigkGCIKgVYRULDBUUYBQ02KuOyZvX1EeDRpxxfOPLuHG1wPBoUCUQhJdjLYsoMy5ar8FD0hZ/THiGj+fwIiNb/GLI7zyup9xvTT/+lns//5FUGgAAKTihoDAEI4EkJ4RAMXXAIyfb+wyzKHFUKSMMUtnygIP/7kmTHjqRQV9UbLBaSMmMqxyTISg+Ep1RtPSvAywzqzJQZEKeYCbxSMVcJmoCxYjyxmxCqJvO4YLUA0NC5l42BkNwcObFUQOloxxBoY3+qv5XnRU8zeKmxD5tXHsVK0UvM3cJ/7Es9ybH0OXLBRovJZUKEgCAAAUASocnB3pxNmSgAKJJqKK2Hh+TApTihYyYl1UYOExYlq9w2ypyQlcTW8Ky6tZ2/7QG6WAwxAwMKXjJaYw5JNLbwwnNJKTPwILCAsfpJucChN2BoNXjKo3i3TGdjZh4FGGXMhjsVZK8iplECzMuquzZfVQ1IGrIpe+FeJNdR9wjNq9SqDhsvShE8MOaPzHRqH6rVEgju1hpMrhy/eyLEWdPbd2Vd6szP++jQolAqERNgQpkvVq1nuf23OMOOif/xZ4KEtwpoLxAJ8twHS0ixSlq8eNRWevy4r8rIXVR3e1f3M8KBWQY4MSA07qyatTmBNUf5HWoAABuUElZzJ2YqLBSsPPBTIlosDBhJuAkJHkWOpAUA6Qq5i2Q0XtNd2LO+4sPIc5U1FxlbVnz/+5Bk0IKzmkJWuyxDxDPDKqc9Jy6SAQtKbbBaiM2RqcD2CPjDIZDE0uFEYOxlksqu0r5+3Ki06EoDAk/tojolZbK2A0xSxOGoHHZ5xJxDdQSGUEVDNTagbcGgsIKA3ogg7o1DllU+3VzXSxPsjYNbNK+sNblwDQDbeep8g/RYksdZjKwlePlFGAbddSnCdVqrCbtSedMYfQGi8yKKov/e03Mcj4i/IgwBGU+p6NXdxY9OlEDZ3sabRCPIRF5jaQoAViNDFhkpRpjNqimq5VUExmBoCRIYT4bwdRnjvZ2s61cKyEcq7YTIBqMYqEMnb1CNM7FcnGy6lniKmSMjlRq8KskFTssWDldQrRJ7/esz6ajSHTGtrrPYfff97fHHc+b/dB/53JsOxqmb22AOAHqFcTMuTeGpH0yPl0j2ZTw3h+oy+GgBKSgAkee/NQkkjnz9SgNomhJCF7F9waiS/I0ABYHBR+uJwHJLXMiENw4NC1AhEFHTCCEuHvbiXOZyUApTAMNKWsRedn6lYODqctmKAEsiUDziJkSZe58DtEQesEf/+5Jk2Y7EPFJSG2kWEDFkynI9JUwQkKlETeHnWM0MqQjzFeARCWA4kj8Ug4BjQ8SRGKxMYJ8O3FFUxXmTW56gmSVvNFxjy6ET0PeY/6/5PTz6++fqlGrB1dq7Xta5Ambq7pQDmUHaBCqLIQSOOrUXKZEz4OhQkFgYGZQNoGrjPIAHaJgyZpSV2TfvnhUoVBT8MebXO8x+TBdgVETv04wVoAUebUIGnjJkZ6FhUIlImGAYwAhcGRMSZUFZc7LxqnLIUVVprJWrOyFwVr6VC1FzsHeBAI7zuLkgGTkgKxZr0VX21d/a0COrHNX7srQVPTYFF2mXKbAsNo4WiROxHX8BCxkgLqypXSUwxENw2hT9Syrk4UGE4x+/P6fyklMHBDo9jMr6uP/48qDDs2WBhSAXBkYEAPnmG7i45S7lsPKnY4i+dCXUJMIgiUSGLPM3DSClOMa2JoUvvR8yAAAKtBBKekWA4/DoYzoLM4JzBAUwwGMrARwHeESAxECukuhTRydLLcBB9+Yu8bxPKzthgcKQxDatBbyxDTNH4WhD9CwFkzNq//uSZOAO9Cg00ZNMNaYwwyoxYSY6EfUtRm2kekjKDKiBhhjoXMZJhgfHE11WPZtGJkAaVK7xx/0RSVpMqSzvMTVBTtBOc+V2UMzCTmszLstkRTVa2n0+mzKy0D9Ue+L1PadvdbQARgAAmAQQlYHSD7RcMVrg7jFu/ilOKujA5EAhVo9xwbg6aCIiewRnnd1vb9///////vrDno4YAiDCBMz0uDnFCg1ogBB4UDAJDo4hsr5JOQBcEFiFlT1rrXI2ZnTSQQBIA425QUAX5a0z0ZCnMSXgGo98DShTq3TyDYfRIzZGRPcrFdDAdNRuN5L4tkBjgyLy91MLSapddpsA4hjBNaehDJaJN0CSrKvmt/7UM+g06wOt9xJnRK3CaB0b9rIBKUuoxAYO1J6TDA+hCRDo5gWcS5rgxFrDIFcvlA+u1KKLEfnEf+Qk+yEVO+yp3/N46gAAXLgqGP7WIi5s0xnQZk1hQNQ6gJWGOAcTKwIkAoIfCgnCHpUknKI88zuMIDg0oSmTio2qtDbq1ZjUaqPzWpoAl0zD8YfOKXm+geVyzP/7kmTjDoRHSlGbaRYiM2IqijHjYJEtQUZtpHhIx4bq3MMJSmvNh1mQbP+aQ9xJ+D5Wh7/04LzYZzMX9O3M2VzMXwuYunbk4QVDRf03su26EDM8lOfzlxpIIKL83wAgAAAQ9cIRN00boKCREoEIinDC5gV/yK9S1s6HOpB9OO8nuFHqCp8UTuQbkKSL/db16STOppCv//XT9YALIAFFOWtVFoRS8sAKTQUFh0TUw1O1bJCliCIchatkPZRGoebnBeM0RXZuinicleXgYiQ1vEfMz6EyKg3BMQGtCL3zDg4LsYhroDx6K0vsn4DOpSlJptxzP17BgkOCWgZMzP/7z7FH++9Dt4wJBiuc5CP32F5LQZcq43GaAmI+r/igxKfHAkEEjm55NWOY1GkOUFSfMtUcOz8zLw+Hh2fnBLA+mNCevf69ObvgABQAAKAclbrKOAkktyJD93f6//q7fyH/6mT3V1AhkY3///IE/f9PacR1Ge9PugABt6DU/ORceJEZB3ghAaeAmEi8YgrZlfWuNbe11HaQmBoJyjeBZMue2Ut3ZkH/+5Jk5gAEOlBRm0YekjviOlo9iQwVmXFXTL2L2LeSa6gzFYJ8MRi9FK69WBHygJDJMCNPxRSCRL8YzFVUTPFOPshn86tbowEiO1yVtbiVbGtYXol9DzuYV6SXWq9pCGIsYOkt4c90O5vNJnq36Gj3PL/wxZN8c28aEykU2rm/BA4SqtFh9naysP0UtneU/lFPP1y+LOzC2ZmGmb7dGPNTgtCGsqdUpjtYFmgISAAFBgPE7KOJoHvsxsn88g4j+Mvo0C/6nEHXooQCUTDE2H7v5hqY+sdJ////8OregsAS+D14BOQmaPJDSKbABBL7OEr5ncRZHH1jKwPKyRWYefdarClyLceF23HqBUMPLWLGE94Xfo2uOAIwWbwdcj8NMAaagSak3MzwisGku14dt948bWAiijfyb2p1cp1VBJwIwu4czizQKmEUBfY1NWhbdyqAp7Y8Z77UNkZdLTi6WJMJ4gykri7em3P3eJLE5/f/PfHcfu+//PPG//635L/faE6GRS4dy0oCfMBAggbX81MND5Fmnvozv/f/MHiH03/5v6f///uSZNYOBaVdUxM4Y/QyxJr6CCeyFRFhTky9PFi6rC2ocAuC////////1+yrs30eU39QoauYmgBXccx2Bi5lErOAdKMSBMrHMsMRuIgZelLqHndqkQ+FL2cwwSqVLxR9QPGhqwz4LzTMCBADJKX0gJBsziWaOZiDCHkbng1u0sZ9A5UITcd5TE7IkY5E7zLG0pIrK4BLCIO9itymvOjFFRLHfkLJspoYOxi12WRdgQjFJj5HS35uUwbvjVUz7N2U4DzVKsAqRdyyLXnBQEIdZqaon7JUmBiSzzqimrPBQ8ce2D99MW4b1+2EuO9s7zBf5m0XGzzogAC1GCHECAAAcgwG5j4UzgQAAdxz095pEti4omLSnS91DgJzvkCz+kz5/w+Faq5qRYKBlojLrjFFAEKWUcIWq9IcITrCtAZOssuFEnTqGFfxt2kjVH3kWm1llLdhC8aUW7Za/EeeiZZzKhgmB4rJ5XD6tT4thN2M3goZpX0wn+c2jkXJ2gvIW0zFi9ElC7A4Gu2oQ11rFnfGUIFTcfG5X8lo29Rnx9tQkAeBBf/7kmS1jgX1WNGLWV3ELILLHwWLQhV9dUpNPRjBJJzrPPMosDY+ZCYLBgf1jKWnUu5mi7oWD2DrtEiGJqmmL4Vynrtmi1MIt1m8lRFv/+DqglQAEBEEAI/gD5HSvs55Ez0/4c2GMaMzbCUiwsy7YuHoh2MQxUNQDo3vqSMpAX/ypL5uVFwfF7c2ouG3+revYqSW+QC2PHmGSdUAAGT5M0qFCAEEmnMHAYlYcViG0OrRIApWhVsVIpu2YMGUjCTBAwA6GgTcwEGWPRRZdVJDgGPEXwoCrXUefyaf6jl4VEJGMmp5SllCoAJlVsSmTzzT5WFxnTBBT/JqzN7M0xLQmsB4AIhNsRN6i0kmUS093SFbEDSrd53SFnUAhxZUspQ48jKucOMs/LUIKDh9QZBrF3OjTbAaYuAupEgKEEgFwAPQhPDPXQUeSPHNOfZYKliZ+HFTndfWjQGjRKq3y3iJ/BYK6kv6u4u8sSALohJDiUYyHQAg0iIoRmGYWNGtUKIKMIMKFlUMmy4pgCLiIzvAbNqxQOFwCEsojKcCv5GOLQZTkWv/+5JkhA4E8UNRk08eMDBiuuoZCT6TGS1EbWEPyMESKmhkndgz+PyKtXgkRAHIRVdL82pPKHagJ6o3P9zpI3HvgpdUCOzurWg/Ps/4VEjY3aB6a/fy3ZRD2OZIUaIoCJ68p9Qgjnjd+/Eoi3/Xr5VfrfUmxxddfO7H69ienwxQFNvLkEAIAAAEZwPicAYPdDwEmOqsxKPoYfFg3uJb0Z8o17pcoA61u5x//v76Dw5/T//kvqUAjCTs6U5Flc2BhNYOjSkUdPQcEGFkJKEGPPJWmP8AS5Yr9mLhDPy0pgQoKGiTTBGXlzm/ccCgDQy6JIWmLgAJBGtL6moovB4Y2qsZIClAAqVpZkNqBDoLeQQbyPeMjHjpFSyoQVi4mjZa12W9tIUFpX1U/W2rdZqJMec8smGatLv2TeMSwrq0Pt81ag8IhEc1MvFV8/HTXcV6+a0GSwupP6/jtgRMIXqFokIR360bmUTrAiBhWmgSlTJAfy3cycNSS7p1HGGnkmydGLornnf6NIAQzRD4ywIR1NIIClfDhYxkoHTABCxrYaYcGrFV//uSZHcP5R9Iz4tvRjYtQrpRMSNak6TpPg3l65C4DGlIVhgy20EeFNIAeLcdJIBvLVWEAIbtAgEqgKGukywRigpgu0pYTMxVjzqyN6i6xZmGXzZmyZYx6lKZwL9BKKjErXqtexj2qQiNFcZdnUZyFCOIZiZi1iDPHTi7Zq11HhPKPVG/vefWa2UjHDtb2t81bX8MmADZkTBgupS3LqjjNgwBqspMCDVLJKNy5aAphxWl+Qh3VQeNykgo7SzTgQuNTdG8cQiG13fVvJMrlcrLO936VQAA9YQwcLzC4eMsgURAw6OOwEhjCoOMQANB0OJYyEWZgwFF3EBYKHKtlGvA6By8KKAkWCDV8wlnqXYgBEco9gYAbKwwtdTtO9AbqwKU6w+zzGIPZTw60JpKzILr0UclszYopPTo+WKOtqnq2Y1DSUK9JZhO9l+uDAyFIxDD8eWxQe0M7SbSDkD6kWRr9MV11SOr1/P2u8118VueN7n46nmX+ISi2NigIAMgCXthFSstFRa8SWE6xiRlUa/sAHZFMkPU8nxzIhBmd1iG8df9Pf/7kmRnjkU1U8+TmUPwL+QKZjDIWg9dXUxtJHbIxQ1oyBewCC1JOdft8j6QrvFwFDU1HiAJWj55FRPSRuODhjWm2diDi8yy2W0DV0NmS4OlDDYnyUeWfaTlljdnPhNmfYsmaHFidtEGXCU1zCBakKzrhBToI7CrpKAaRmrSu/PEBL8O7N/Nd40yy+ZnSv0OCijtmp9WF/d7H5ox5lkfSkJD/LfUJi9ABgDnc2pwLN5h+oMm2j1ebOOzoLr26wRdzzLCldqF+7WSkmybeZ27/esL2vEvQJj3UgAAC3S+oEABw02AUxvE/oY0QExZkyI1WkmsiAMpEvG9g8VJg7Q2PvCXZWLCk5S+QMCvGzlQSOrySYhhoi+m7wziyGhXqhBg9FwcIz5w9Pw6UH1NUNOZcHwGHmXTXdWwNJC5/QVhcbWCURX/mm+xKSta5hJIep9kpEAtWhsQ1YCoPgk06eCuKq9i8CLVcLh0EOHs8vJTjyCLBXcVVKXmpnHqYEI26Ojykd+5VxDu2301sdJF96VG9X2pOovcORZpHiV+vRSVACQSVFv/+5JkZQDkdj9RG0weMDPDajEZ7BAOxPtdTDEWeMuMqMAmJCBDTFow6wlSx91KVdMiduLuE2kONvLM60tZE8luLv7l3tnlda9S/Vu2MXW8GOZ6Ujen7VlrzyTMnwW1WrXbWIa23EXIuB58sxjNKh8dcTdFouMixm73BLEtxY5GYa/Pf/Of6ZBh+mWcZnZJ5d1M5SwaIqB6JUZgmYCBH1nFwo2scDRJJ/PImCVoHgg0fc/EqoVBlBiQjJmGExKBW6ha215jWSoAAEOCgBxIBKAMDMGROYDEY0kDGqEICwmUPD1+ID2dmAFJqrzXsvBQVCyikjY3UdZYiBGkiACBJkR50JxlkNOw/DdC9Tw6h0cgLnZmtoWxhjVWGvxewfOxLHbQNuJizX6uTrtWmXmHmLQWfj9x7p/VYIFp3LSuqAhcsHX6ebBQcho+KuaVRAAAAAAGAFBQ4bGFhfwMvh/uXba4u9vYuyUqWMwWbpI1B6hXb5wfXvWU0uCgb6vKu6P+/4fIA4MiTU9QxMlqbRmd0yQHRGfOcNJG5zLilIJQUmYmMtS2//uSZG4OBC09URtMFjA1gvpKPMmEkjTlPk1hi8DSCqpcYI5KYxAQcYHXfVW94VaVgIJhYoJVYYSC0rqXKuWUQw8qzl+IvC8Xift+3tgOUymmjkRaDcjK8tFNcfh+NAg0Xl983eiTHS8I2I3lzixYORiibY3r3+7LV5z6ynsxa80yszNlgtg+97713SceLDlvOTBcWmYBAhFSUUFnkjyDqDWAp7ObO64GrAMQ7AzMQF9WDoZec6VxZ1enwG7V4f4Yhh+r//p5dikl6hkAElOXPGFEIgpIlzyj68VzKDsuLgwjw658ESqRXAXJ9TIrn50Tq9zCBnW7bYb6PRUPH7AnG1TjEQwu5bwFs5jRMdDE/GwqFYyEICPi1sLHPDVeMx19oTa5dv4yvQxTq5aL4aBcFRTLY/TCUT+8322O3EfQVh0UyiydsL50OM/F9OF/QtkgMOmJtjuasclBEb0PQvt8ZXs7nTtbAh786G9whMbPIhhoHofqXjbjt8c0BcEmtH4cJO2lWcv47hDGFJKA6HCVw+v87lc48TIbFsEBgJOU3R0JXP/7kmRsAEZnYFU7DHq0MudbWhQC45h5hWdHsfsQzY1rzDMJIOoGFiZ31/dX0/9CN/bIcXZfn9CI06nIHdyBV7yHMkJf57ihRBMh/k1FOVQKLd3bSHC4C6kDPtDxkkvOAr470mR3txYFLDY7s2Y7i3RW1XJM3SLTjAX9agQH94cuZG1dKhqNI+C7B0K2rh+Ib/IRkDgHM1hn+0kFGU0UGTSMCgkiOOQtOnfOhMOSOXxkeL/snvRDfW00rHrzzjCJhYt3SmXjAQFhyM0h0WC2bhOPQHDwPRqJhrS6d0jJJDUwn0yzv2qocaggaQjLOrlUPydzOw4YiXYXI9Vo/YKeNM1Z6oY4alYjIUjKkjzmjsGgAAI9sHSd83xT3nQCI2cWet6JnDH9K4NR2YYMiOIYAaim2Gf/L7VvOHpOGP+r/bZZ/+o1UAwQAAAAATjdwsNlSEQUmrBimSvmVKbtQeF0KJvZ63HIFR+livK9PPXCOdcMth4x4p+J6RlXqm0xWiPRP0GxF/Ti6AR4W3WYEHe7KcTw6Z/4mYcQ3FewNlveBeIxLlj/+5JkL4IEfE/Xaw8ccjNDWy8gJpIQWOVfTL0twMsNbHQynWriTWriFC+25CYut9M01Kp2yPW/hLBYYi5z34DL8+BXIrMuy0fXxHn/pSIMmdfXHCs9IAADIQAJAAAcHgVoHtvPbk2ljlm4Q95PrRaLS+5FxKp59F7idmuDGuz/0f///////DRcCAAAQ5BoqIVhkIBdUbJayKgOEoeHJPVSySso4dNFuAuoWkxVzNcRvE7VQ0gm2+qy7maTnZDHHwnY0Aq1Q4TM6RBJIuPFzW2csccJ5ca35yH0JOucWFijccsoGmZRfL/YND2XvlGF7PIbCN15PDz8oIu4y12TGBM9LnqKz1JgEgmlPqoAIAABAAAAjBekWQtYV+VYcsDa1QYB0UarTKAga93osooF4RZvJVd3v///////4mnSI5UADAAAACpIZThZEmQqiPWKPFUh3V4nMIjOoG0mJ1M3viswgmlTZVXS6P2oFZit4YSKC5m47GtQ4j4ZAZBxXwfo/ZpOnQHprUTJaS9MwAFxVL82tL04KgKEJTxafkXoPIbvmSA4//uSZDIKBGdI11MvRaI0g/rzAYcIEnVjUkysXID0Lu1oF7TKamvu7UPBev3v5se01w0q4rFNesXNQ1d93li4oEvHG02n/J+vSyaM/0wRAAA+XU7lqpAwi6Hk6A6LCcX7MqFBfmWUbHDYL3b7A+Hf8TM3YBit82EOr///////wM6tYNNiMAEmTBsYqIREMRN80OEHDjEjCDFL5ZVLx0q7G7NeIR16pvphR+QtYvNcHijDMCAojOM2cSZbRyZUkcgFil6kpJbal/IDLKFAUve29P2McpQRJsFpJVy/MEEk4C7yUQ0s9h0GVlD267oqA+b31t5geiHfXH80bG1/tkFKnY2gI7TIuxXm9grKrMabhjp9aDmrrgK5YCERYG5GQXGXgGNubulWO1jptb1K+tCXBgjlv0ffqCTmZgbe2Sa/60W////+////////////y6TXVgIKAABKTs0quFhBHCREpwtQCj70oBgVsjlFou0VSqu4tVvXBgd429lMoyhTClPuiUEV81s3rF0vYgW43+T09fRyLWRx+KY78MU8IH181e6gm//7kmQoAARhXdY7L0W0MgvLGgUiFo+4z1VMvWuI1Qvq9Geg2CxRrY3bfIOADrPzFag2u6pLVHLIv655Eh8VXHwxenz8qsf391F//xFF0nx/UByi/CCCII4kVgPkNvEgrQDiIAAI0DUzbnuRQhqm8qoGdl/QT+kwre3mf//0oJH/7/6f//wYF///////////6AbDAAQAAAC5ZcLmBYEyETInEkVLlFEK4fRoUUVh6sgdJuFrx1j2QQ7SIVr8zmoU5NtAtKxpUOcVjXKrViOaIl0xKtDh4GwiP2xzwIoaSaztUa0gTpq+dj/SuittTc8NRVm65eddUdEu2qi/CuOxlp6rav/bBt3MLq/v3G/53fl0AFgkAAAAHxmohSI+xhdQUZNH9mp8cMVnbYfZ6Y0fdjAtX/jMlCIjOqKeWf1ez//u9X////UqAAALkjSqY0oYaxwikWCVQpQ6iWMtGS4Co2lNLZe7EuahE5PXJhKGNNGZY3TseTYjlpPZ7KVCOnwSAkOoVyyNY82YjIBbkpeqJmCVPYZU05obs1Ucj7kHcVbEzJv/+5JkLg4DxjRUmykdsDbiuqo8wmaPrUlSbLB22M4NqczDooLPtIqKYZaw6kM0JMMeUYHU2wQNMKiYER7bF3xJrAJkAAALgT1s1IlmvBRBIirIQhapMJdAyfZbwj6iaKb7IUMAhWkyEkGuQ7Pl0ndP/HgL/////KgpxjYs2p0HrgrtH5RAiXQMbKX6KgTOnccJgzvM5mWvpoQ9FB4GrxsFA8Tsohqw1p903NsOicrEBEElfWFqiRJy6yGgz/or7ts+bQXTbxlfr520lFFCk9OuEFhfyuSu2Rl8cCznyGyIlXPd6/5aXVweULTOse/YNMWjfURzQgACKAM88LC9cYYSnCUhodMF2qaaNFmCzf6FiCBsClinetBYsW1N22cZ1yZ3XFH9Bvu/4noAAFPdN1QUCjiLwfhBz4qYAC1VVSoVl23NZxksq8RJlHYXshhVMrG1pRCVg1DJNJeQsXVQ7szsZzC0nmjIKnQyJt65H29dT69Y/uuHN387VkUYETtbVBYTAxmQjPQUHkMlUkm99IuSr2RLV9roRkTMrzjWRrKLuOL///uSZDyIY/dNVBsvK3IzIrplBekIjyFTVOy8a9jIHKoc9Ki6auYD/COwEACJOZXnUXtTlm3CdHgeC6NcaLI0lxOgWbirplWZ0M3FffFXEy6zgeSsh1gm7tZ1t//rgQCCnJsIIGQAWYIIURmPyNLdMFEZERCw4XYx2542KVrK07JWuCWUzMchVN7ccZlucbvtbUR5RMO0X3GJVc+mCiiHdhY0dTY5gV3K/oDUCL16gIYkh0SDKmlPhOYViJ+mCc0cfbTMJDn3dfMh4bFaasKadL+CQasjl4FQBm0rEcJN0xlQFFQvGtEqPVVSE9T7ohjU5ie015ysguPbPtnp/nWp+//2b////DEdAQAAAk5HwNGj+dZo4i2pISgqXbKgAcQ37IW3ZiBWMQbridRvqFRO12mlLljZyQAr005ohp06esy6JRPAeOZJoUk0q9Z7QG6jqIGkzKIaBwhTOfmBNbZl1ti8MqFk6uCZOK7yFJZuQ/uWvV1M0OedIiIpmDInBtLtJgACCpciktYiSGPqHQUh0NTa7NeMsMHidCw+cAszBc2W8v/7kmRNAOPKTdQ7LxtkNWK6UgXpDI6Y51dMJHFY1RJpDPSJcNflaq8qq1SJF3CHgH7P/63/////YgBAAAJTckRARHnGCirQMhAMkY5KHRJNrzto9P6s2vI8YdXpL46SmREULjguIhNAaWqaCYPBhipHUcM2SjFd9z8sG9zY9DBDgIHFmX8dd6CMauOYMpRixhRwjMSpm+J4BVmkD99KrtdpdpOD/EXI0totIrf3ooAwolUf4WskRdzCZkAWM4xUiXHEUrPpG1Ta+K7aS4l/IrxbOSsHN7L52+alH+Sga3W/52hdAABV2iaERFAaCpjLieIiBS3bGvIW2Xi9LyPAo+3KHJt3hCFTxOBI1Mw1ereWAYH3QNhi1W3DmmQRezRX555q2qtNYnX0nxZruxoFlu68zCJR1K3aXAmgZfEzyY/NSlpVO//1LPxEzIHJw2JJWLMgSH1uEnfvW7uuN/2BIAWB21kbg23j1ianA6EZGc4TLPiuCQYdbyjclYM/PrMtzi2fnJermbt2FtolbMC38P6VMCKl8EkgDsiCYx0TyETCCJX/+5JkX4bj20dTmygeojNj+lI8woYPKPtO7KR4QNANKQR3mHq+SReoCBQtwGmJhPbHuPPEVoOpB0Yfhpbus6bpDhMNHKsJi0QhmN3H2Y7IXAl4MAgIZoyiAaCkJpGc9jk1MjrmGYU+a6xI2MIrwcX9y/fXhKZx+OnLzWOiBUqOixygm4uvm5M3ENwqsa9FEBcLqWFOjZVzYUslVwqFHJi9TT0p796iOMHyA2+JRZ6YhCEWh5rualKj4gOihTTut/4k0AwAAAFTdgJcxXqTgFGF8FCS7ylTXWKpCq5eCDmcy7C2tRfae9T07Ekfx0XD/cBRwfEc9OUPPbOw50tFskHSt1CcZiRbAGlOgya6duy8NYhWw/V8nOh9waqPW5C1u2fr+YVyiW/hHF3X8+Wjfbgqv/vzuIwAIAAAAARgB81ekxKVPoI0j2iCLIwSuQbzRmQfvYWjC0EARJnG3orF6WVG3yhiSBsTOZTc7of/cRwQgBObwWpALuEsEtj0FKm3IVwOAuIEhKBuHS8SDUSxpWIRcWFVOAMuHwA6guLjR15KvTVW//uSZHCCU54r1NMsNEI4w2ptPShKDnEnVUwwa8jckqlUwwqQkpBJydsejBavfMERiK2G8KOBRC4nQwpi5PIYE5RGaU1U5/owOw4cYjk2/Lmwx6+xcL/z8wderzY+32xb2SRcQBOb5NGwrToZ6fm69YOp2vLDhILvuaer1A9JHbIOcGc4lLGk6XTAsFdPkI102o7pO9Vg7lOmjarAAAsgAAFTfs9b4QgkwUEmKpoxth7+U6nQHCeVRpScdLlhsI6mJJa58MXTthE021a58qu7PMORK272fdftWGgz3fJX082rLItpob5F38/m3SfzzdTKFcKw8FngRLnLFFTY4m4qoax4m+mAAgokAAE4AFwDkY0RiU+gLAwNCaboRyWDkKMdPziUqEnyINNVl2zer3UPlgVk0vDb5BmcHjLEUq/qGlEpLcYqg4quvw4jLOgAz8qWxRL9zIzLX6+XXOL6ppFDN+cncqes0R7n5zs1YjMzvOUD/TUxqau0Uoje62s0OlBWDWtxWNtIi0aKJYWBiRC3IiKz6pTciLP8vumIcdVUZ4Sk5v/7kmSDgiNIPdbrDBrwO8MarSWGOI5xX1hsDLsQ3YyqKCekKI3gzdZs6lRmZDO297rsa+mEQACgLwERLZ6hCSHgWU6HvXcqSXNORJAKQSnO7Q4sq0zLrRuqk5tZ1SZbRBYw/PCxZQ61nu/1f1UAAV3+VJ7LrKUqCBUIhUStQKJgK0BQJmn1VY2hi7VRGVacS4lUB8RUNTrGl6xmZwar1y3oxW4ftqtilTptrqMqTgDoqBRSc97Xu96AiAQQzkOhSjlIhlXsfq9aN97aL+vRcneju+Y0FQSOKA0rAAAAACNoEJ+hDw1D4GYoNysfAKHImji2qCYXhiMvGrvWMjo67E7NeSILYLNc6jQE0HAe7f9Df6gACm5KEmOpuFgprBkgNFLBBMrpTN0H7eSTvPP0PG9oYblT93o8AwUMKQIhYax2KpILBBL3xVzcecwvWq342IS6qZGiVIVrMqoQQ9eox9PZ+vkmb0bKMXfVys1Xoz1vMlJul692Z2v3DOMQ/pETmAQAABeA81y7srSPIYMJOuBNAKeGSNGyuSkokkRKpCLE4uH/+5JkmowDZ05VGw8S8DfjKnodhggNxTlUbCBT0OWL6Vz0mWDnNbNX6lFEZlFwjBUNGcefvWSu6f/q+xUBAAAUm9UAAFGjoxARhyZRDJGxibcmrEpVE5bGdyOx0bprtZFuMFMKhUqMwjIvCYIrlGcWJMEU7mxtHbuz1k1LPUnY4eud3lRm1xioV6K9r0uQYK5yixjcWIvlqaz9Ypl1P3ou5WXC4AAKoHSSnCgl7OExANh9nmsE2JDzYws9ALGhxpVSBJUVjgXPo3WJxh436Tjc4CnBlQt0vToO+S/s9cAACAIdv7KF1hVMw4wqAcoKhAjTXdAiXEoYEE2BXU1i2DgVPFFtYBQmsNlMOQCKNKs0w9jiykmjCHFx404fkdpBEVfprdHRP71BAlIFqiPu6sdE3JkLNHtM/u50mB1zym4+xMOLEaT4SYwPD7TVbMAVoHlTp0DqKQ9BJh7BFHYoiMWUUQEQIlpskv3GARXTKru3sPcaJ0Bkapi7L2bn2/Qr/2GVgkAAU3Io4mKokjGiMRlpwIDQcPTKHuEjSOR6Ycp3rtMP//uSZLMCozs01DsPEvA5w0ozPShYDdzlU6yxCwDSCulo9higTnH5DSB6Qddcqo/YSrjxGddw8LNolUQAy12IQer8btttM/aSk2E+/tb8Y0HBn9H5v9VU9j2jlD/cGabnkRwZlX/+7sHVZIExGC7i0n/+ppShNUYBTrogsDsJEQVMV7SrfDEdiUOzq+zUJ11a5PfMBqbWTaTlvu2bjRNTXWOyqkqTLiD6zqf//+kACQAAU3Jcla6ILMha6lzp+PO0lxFq0TQ6ULAw0+cB5kdxZ2HSyZgT7exCs4IfLFDMhlRjgrCM5u1uVcyZAU4RXYWCN0SbHUKWW9jec/2yz8X+1Sp5wjM1ZeFzyl7C8TSz1AQAABIgkkcAxhuHgUhiClK0eBvJx6abQo1MwwDuMV/V9GSDJdZnBgl9nLRjMZe2dXhTKjBekwtBVB9KccmluzF/////rYgCAAADmDcToqIJzEuDhT3JBswG7GhGGPqjnL2kNxSpdi9BkXXenDAT40ztLQqLllzoKh6SH47UHAG6sLQTQlDZyhGVKtA51K2hQocwu//7kmTPgAOGMtU7LzLmOUI6ugXsAow9OVtMJG0RGI0o3PEmglU5+HZUAxKHKZ6DCllx+x5n8GNmaKR0u+888uISf31+rLP2OZcXEGI4G37QAnBKRIAguxGWJTnJoCoXpxcfDIFQ13fZUZLHmV1U4iU5lMqRUMMTr1v+9nt///+qyBgYECA5Q8zgI780whc9tQ2x013EDUTFkAI0aSIQg+LDA4SMCxHWVjQCJdPuTCfxXLtLdm3JQnsLjbRXSeqGH/UEdt/SQUSu1i4PBwAocGLwEvPjYXH0C26bbs/ZlZhY6rraykVIuUO09mO/11ypvkOX//db33Z3FfVqhRzf9LIcSSp28bVgCAAAIga6toOOcOMuj1uuPoGEqDQmoNCpYTisCAeBFQwY55osxNItRaWpgJmypMgDxMw8m28ildPej1/////yMsgAAcMLPjtwk2k1Ol3TLPM/o1NzIhZtNmJzAhI00uMbMBJg4dtHZRnU6ht10cQcdN8hEmYnGgmXAqRGFS1BdBCk4j209gjT11NJC5xYkPMNlTlqxr5VkwfSGm3/+5Bk5YoDxEzSuywdMDJKiuooAvWQlL9CTWGJ2QaK6Jz0oVLkcZhIMjo4vPCG8hu0MjseSSTwnXHEbaey6G13zKbrXv3OhtH0t1fk630tGPS7tr+C17+ZT9RqTisvzSJtAAA3YZ01H0TcrkNNWAzmiLqBTurNU0aAVk/qPFdm1MOStOsh5tFH+QlCNo796SfwUiy4r3eGvpZJo//+ja4J4FUKCp5wD5mQJr2oKKl2OBglrQkxDlBMFXMz8TwIlWE7PFD0PdC0lzUhCYy2W4ehrR5/kaYk4fg2T7cjTTZPzTOwbidVUV2RWGQ27EEumSQsHbEDkabIDoaNvI76IuT8bNd8QN8hwacBaW+cXTs09j3np6e+W/20DQnvpXyIdqTjMMv40Fo50EWNif0PwaNYLODbJLYpzi8d4N7n7MhQp4u5CS+X1UXOZ+7/7NX//9cZSgAA8CAJ5A8boumWnRna2IzgwULMOTDDAkSUAYqmOn4sFqKJbBiCvxIgcCQBEQrdxGOhxVyoYIBSwalSMhBU5CYGAIuBUdhbqgYNnhEOkgz/+5Jk647kuTJOk3hi8j3kajM9IlwP/MlEbT0NiMsMKQzzIWA5n7KV1m/aajyipVAEJ7Di8FMKjl7InVi8Ov85aqlq0/lqWRR6n4iEARmWZ71G4HzyND8yQ8kkIBEcqGQkUHiMEZGKDW8mE356RK0+9mq9OY47m1evs3pXL91vPsdcd3STl0YR0BgAApSToCQBhIK1E10JoMpHgZbP7islF1CFpBwbP3haPBxa/dvd+6qL7v+Ur/+w5pUeQ9p9rGnwTKqkaMqaeAEMB8WDlQwNAItKhHhaxiiRfdkqRAGPoHM8aPMLHdpuKI7iQwpBkLcEEa+X7g1yk3cWXppqBrrVAstBRZHqyDz1VsQUIqSqy5CtA4eBsumjLhdC2kG1weYiRACMma6NWl0sxKHtV0ZFt1P9NyVXY4LqBMs2XqDd+b9L/+/wqSluiczO008i+w1zBRIQAASXII0ZcS7IaO7g+kWPtnSy9jlNORK1INHgnadBxqGJrvQun0f3fRpK1/+n9NUABadMlHGMiAhga9ya8OOjwIRJkQIBmFCmPEhh9mrS//uSZOaOBZ1WTpN5Q/I34YqHJGkikk1fRm0keoC9CCqcFJgaS+zzTdkWMq3NLVTajAif6nTcU5mFwA77ZqBUrF8X4Xey+eZcs6flyPQJC0b+PeyV+ZdL3JfOnUynRAOGQmXsvwKKJDd5it4mJkYwEMZQnPBkTxSPSh2JRT3LmGqrnWvh3HJj/un77Bgedr/bp4/sVAG0AAy8OPXteL01qAzoh5VOi5Oahu8tbIhoxotcezWE5/UIurqVAj7/R/+rr//lXfDtqg6Crl4GYJGMsglQI0osCDixi2UZU0ayZIcxdfrE0hZfGGZMBcJ1R9siNTqeDcJYWp/kuhp4YCWP1oJkdLKpCIq3EpHMj2WKV82l2le7yu5EyZbb22fNHC7hRDhRZMpDuepNMJg/xG4UYt46uZe22csMGwlYFXHTMhcdCzQQ9jEKEPidqowRtAdEm6kYLFzwtagLJRqMi6ZEnDMUiSgoCDRXH2pl40qHWB6/u9wABaKgkZODm7vgggDDhMeSgUImBH4QAA0lRKMVBF8JrYiQM8rlMCFjdl63lbSIUf/7kmTOjgR0NtKTTB6WNKQq6jwjiI9UpU5tPHFAwI3pxPYYcqCp0piPCr7Neaymt8KC4E2laPsPl0YmSYHh2AWAiQA7Moi7Tr0YemBRFQySJQ/JiEEVEqOzp4Smaa3VhxqP4GIAg9dz8tFrCXhrLIt9n+j/7eb1RvX35rdNzbKNxW/ZvzuVkIEgAAcAMOKHkgOZVxU/IrWgxi4l7LYmfBWfA1KR0W15TpQ1VPzgnSVFHdJ5HHlrJT/7v9YABU25YDCgo9wky0g2QoFQjSgRGlJiRjACihWIchm+x4DK4zBqGiL6lMyt2LOtApEBciRy5Wq/MM/bWeeSYjkeqKw1+vwwmlrQDCJRLMH4NoUIrQnCYznuUBM2zrqQp4nvwWSccnVr14JSrL2KJbj3BBUcL1Z3ZBGur0HvSaEUZQRarhjcmfzFwBZotesIntAFmlIA4CcDOYTJhK5BmipTiinVJuV8zLSu0FMDoKfkVzcwCQoFYsyMVI9d3/uv/20AAFzUYKDOh41lZNBUAk5NBESoEGIsSOxMbAIRDEMZAigLgQOQ0L3/+5Jk1oykkUFSE2weljPDinc8x3SR3SlKbSR6iMOMaYzxmhgN3IDB0RAzAk3l/wM4sDDwiwWB3HU5hmLNGhyXwJGIbd2GkruwTADJoteuwmb1Ko6Z7nuBkqPc+qCp09WZeNDZukg7ZsR2Ubm2sAhHS7W6C9cWflyPykSyocPZn8lSAhMueSdmDJcpQdhncUADYAKsBiljCMGMTonz1iwOyRU+CJ6zpMWnNi/ptBF/cho5TFB0FQUmx8Y4t8h9P/+xYwSTAVcjhrKAjZN8Do1qFzJyVISYY+ERkgejyfM6G9WJhaqZ8GJ7JAoJh7pEoqgqyibburGSaHnYCLaJ2FtwoBLBUUiAjLwQA8bSlM00KWC1Vk5Jc5kER5gU/LXWkcE3o5NQyxiQ/T37WlT9LAcYQDs3ErWqEKIiMXIsQoZpObYi1V3tVmoa3ZTyWev8t64Ao91JYcQUqqps6ksoAAEiiskYTICvIQQjnADCl2KBrFGkUTmHXVBpXPQC0dhUKEBWDo8DErKB1GyDaEoKZKXwk9870/MLPT3X2LvD5ZwafZU7//uSZNKOxJBUURtmHqIyYmpTPYk4E2z1Oi5lLdFCj2eNlgnoqW9P99X//3/Y5YPqQASQAEpyWGUBAYsUyHHHvj7xwtRhEBJXLydiaYXYkKwaCzBrDP3ChqVJCywrFw0AInL7oiLoyZG9yxie5868S2y7OTKU/Yq77NP3xr+1YPMPutV7bLt+nWGbmufv71bO/+aNMtVkRp16bCCHi1GQ3bWb1uRlvnd/6bdxvB/1CMQAJAABLg4yrivBmitJgEz9Y+OxHT1ItfPHHoQjmnKay5blEFwjTrq+3//Jf///3gAAluEAI5nM9ocwDU+ak1ZkWeGmHmRJgguPGQ4q4aVqyQCKZSvZD8vSnYmHDbWadnyqitzGpSgHQ7JdwGX2YHkDoJGbI+jk3AAOVxzMK2HtOwPjnUVIaROw9/xk07Y2b9Rytcmok46VOopziB+jKzaZzWzEfjMkeDEzm51OZXMrO8jqfa071kv2rdQZsyAEAACFow08GQSiOYCW4hLRuSV51Uf63kqhsRd68HBUETR/YQaNii6xtp0sz5b/6n///6IAAP/7kmS5AAP+VtTTCTSmLyI6ej2GGhGlXURtMFbIzwcp6MMlwAF0lHjUd8y8+EKMYqimOlgOUTHUYqBw0AmJhpdZaiKMeMaCX9j78r4ZmvBeUKYlG1UHDa6jcsUcAniaS/jW2+ZTFqNrqolH5RRF81Wh8YtGJkuAbBLb5WPIj8/pDxafd+7tU+tY3Ameh3um2e+lms/9yzzp6SS5Gy/rvRmO0iv//nbm6FnK088zNiz76qjKJiwAAGKIVdkyEDYyBWYoCcOYmcDgAcxpMjJEIUakiTFi4lK1B84vY2xawG47+7/7f//9JUnR2MMYTqmYwdwOOYzChYzcpDgseHCQaUWLNq8Y8yZN5RxnL5zrR20YAjTd4jJJLkvXCxKxL4akmEriMLgeENUlPOP40SelMuoZzWGPFEdKLDoPpHVa9PV+Gu7A2cY7/4f1s/fnDPKuWlOXXwuIpXy5rrPYrMjozHavvt5kTf3711BkJAB6Qgpuj35L0uoS0wu6M71rH+0K1nRcJ7AfJaRjtt5SLb5vk//8vQGK//kayN///t//////////+5JkwA4EllfQm2weMDGh2lMd5ggQjV9GbZh6iPirKujwllP4g8IBEQYtAAbhQqGkGGdGJIAhhop5mpBmBDYZAVpjMsCMqlYsDESIxFkwoBey02RtyT1JBIYiKCSq+F7raUwZuGBeUuenS2Jg7J2NvNDtO2i5GmpVM4PRWAc5JZGoePiS/c9MhGIJFjbO2LDJ40Xp6rUp8w71S+wXWHEDPrrmxzmN037/eu7rtZ205TbzLGXxDfemXO/5Lz+CoZlGkLKWLX3s+1NAACECmlbrZCusHHi+v2alCqiqS0+G0+ugyKmnwMGCbUg6n9H/aT1/V/4P/7x0OG0gywVERi8GHFgKIweY1DJQfTLQnMGC4vUm0OgAwiDoBiDRNNSH6rgSxswE4V8ZMliYHaeLkG8XcmrjFRZwpW6ILE1F4VBxmaJuvu4cZKVe4oBnEFgcJFEUwnt06jmV7RQKIoKvvzPN55T8zOf/OVf129f79y/WiqRTjI7eYvG8VJaFBJyJkgtbLh+z52swxb/BLKAl9aXLCRcjtijB8jarMQ5/XgV3q9/S//uSZLuOBPNBTxOYYuIwASrKJCNQkaUvRG48y8jOB2yo8Jieo44cCJ5v2bez///6iBRzXyazhSQMKEwEAMAAAApvd2CTwIUJgOJjQwQcL1go0+4iFOIFgbSU65AzR3n9hiXPRHITDlaU0bgLUf9lcqoIYZxL4219d79qULCu+4TFEfFcioBnKfTksupYbkeRRKwHWCBAG0aJtg6UVAxTJrCdnWSQucXPsSSzIm0CtdsnLnII33uTWTbWmcYje+IEx4huJNCM4+8PzIDak4UWXh35yJXu2AG4MxAYgpI1Wmi0G3bR3BEaJbhFcnnu8QD6miMLJoSE2n8knrUzahH/+lKmWECg7/1/q/6gAAE52NGUCgaFmKhKDAQSmEBpKHhQJAwAvgRgAoHO/C+sz3DSpX+p2EObEkF1XMQduFy1vl9P4wB/H5o33pnEeqQRyLqwK3uxfiEcUdlUYpUbYXAMXNC7mWyTUKJhAdPTbpCWNW1CdJt3sE0F16lcB7JsUlC9TgqlkMj/uwSLZYl51U0Pfc3bM3S/WqTnuUj7gqu+GCVQEP/7kmSzBAT3V1LTSR6yL6FrfQTJE5LFYU5tpHrAzAvrdPMMsAIJQABTm/y1Q8q4Um57XZo6QiatVc3avb2t7rTKRD2Gn3IWo5/q/b5RG36nfR09fo9SQAAAAFI4RiyTdk9jh8RGBMuqL8peroCFK9GcBxZaj9XNLdTSnYZcuMwEkaXTWSnetaH5WIwbvr7eS7QM/RhgaB4VEVZyoJaczd83MkLAGn1ZQdQilBE/uqhUTrJxXVIj0IEB22YTWglE39qbmbjtY8Ccuk0u2HMu7lZ+YpTZZ9vuWqXpjUobmw2H/B8BnfRCACSQAAEVaEpNJXs8x36xcqjOh7nauik7ubz+azkDg26/d1rYwVG9/0//GP//oCsqg4JPAxmIDY5yWMsCjcpkyUSb8y8FDlufUDMrAWup4ZLlSHEN4DbArKPIiQhKDxjx3DTWUDXyOalCGLW3OeJbSq78LmoK7BBby6mNp6+/yCIaddpebBYJUx6KyEmNTjSIOXnaDCkXpmkNu21mhVDJ3Kzy6vXZx8y/v6+V6+5C929M0n3fdmbVnOm+TkX/+5JkpgYEeUlUO0keoi6i+v0wIoaTpSNKTeGNgLwNa3D0Cdj7NazZq6xVx2g6ietNFSKAgAgAgKwPASsO0gQ8oG1wlnXe8C/nhOXFVaZ9z2I4HD4RnR+qB07IL1/t15V/04CFQABSk2UVGBFAmRC3iYp1ZiuVjTDoytNr0uhczfjCRDh5QZxUGxeGpyc4tttyHoa70eKeVbZ751BUdrK1YtaCUnR42H8z2HV/cTVTz4CJylWeKx1lY9ZrtaHXPNcXbN9dR8RWKiPMEqdaXUnK6o9rfh0y0VY4aEAAAOADLc3okn6DFcqqEcUBAZCJcYMyZBRE7Kag/zSygXLiu6Ulx2QSdAwFm7BD2/LfpAABTtjAMORg0MTKzrrsxsXO0g1MS7yzRdwZCBiaP7L0sItKlkBzaVrKVOkWIYaMj+pzQuc9s8je8rVZ2VEURC4KRFSMAaLZgTXGqHoteaajjWzNrLTpz6WXYVHerWrWb9o6mUXaVM/FJH+NQccbajULn/V/Hm1a5jBiNaSydS361vd98mVCo40VoZKdbLlMrjrK8FWQ//uSZKAAY71W2FMJREYzIvqHPSZGEGytSm3liYjFjWlBhhmI4BFp1gFb3EcoGRj0WYF+cN2kTcfLJG5/5QLXxymaPqUAABy52zJVsaoTAUUy/oMXKDhVBcwyMDRSSC5ALshUta+nlD7yqbJqt0fSAmtypZAODyIHiDJo0iyUEjuo0CzHIYK4Mt+xoFJCusb+BV9Ptt1JNaTEkX2cOLNyCGqgyIXWpqUOfS/Oohk5laZmTZLAsB/3B3egtfWP2bIbpE4D+ffSmnxYegQkHeM5aHGhoB8bBxkiWw1CWFQ5D1MbOG2lYqcPFoTIkC2iCfxFKJBpSMOk+w64eyUDSKttITmHQcSDTuhIyZXC3OZsBGgE4qDCIBUMFjowggZQaFNOQhct+3Ibxr0fizH3CQ8UKKNuA0J21uLQeK+5cieV5mbNOkVJTxpbL9TjhymfmZBVsoGUTOXpsPTCLhyWkc07F3N8De4+t8z58o1HwkJ/V/RPUhOv9EIKoaod3zSZ4B8unNsi/EA4pAAQX3HX38YZtBgl+coqH9QG1gpacegWZXBBB//7kmSvDoQwPlIbbx0yNWLqMT0jdhDkx0Zt4MvIzgqpXPYM4CuPlQuAlOiXuELFMaprSlf6f//2U///6wABgvKY8pHFKocZma7BmiIZCNGaiZa1nxhAsRN6FIcaKwMXbK3zLxIeT1hDDUVl7JJCzAihkJ0T50nh/q9BZUJYwLCtP9C24hIhu1EW+rnk/3TOGzQ6aOWrk0uRCPi5KrqKdiMGIRzaC50QdSQj+78u52H/Ls1M/LljP/u06iqyDHs+uAEAAAATHR8t67IUdBGn4gIPsiCKeBD5R2uMtfizrq/38iO+J29E/p9vtny9q+3////+mvf/////6iOAucHFoEhYZ+LmcGh1I8Z8SjAcY0PmBEyAUw4PNCCTFfA/Lc1NYwux907kOLdBkFCRSsTU1Zs6kGKjTPMA1PZJ6Hmso2Ljp4krey6JK3qml0qjktiu1OZXOCpXyzCQdFRh4DSVZh+OYxyKJSMByORrFn5nl0s/S8tPgjOW/5nT+in64/uSL49ljewkzYne6AQgi0CWABASoD+ylsaouks4ppo1bqTLA8v/+5Jksw4EHyzQk280tjxqSmo9gkrRgMVATeTLyLUqLHUQC5+YmzLb9qT/V+3VfdGp///5tiCQRQEAAAFwEgIZELnGkRg6wZC1HGiZlQ0YEcAUDAgaZeBETUYCQiRQsAZaMUQCCEWiQviMgnRbwG9NuY+WsLWjiYJxVjzRxEluQatW+3JQux4t0NqcFVBhtrHgyNfdg5FuhVPWTzb3b/k5MPM6e9X/6zhZXst779d69S2PL9s68V6Q2a519AAGCQEnRx4s7AuHrnnUC81nXKEqIk6N28vZluu///Kt/Pwdv///+n///////6vCPOUOYSFg6PCqoaQAGGGhuqsbiZHImYjCDCgsIX2IGGIYAJwMMvaXCkMMprBwgyqHBACSJ/JIMcjxPyWl2JgIcKcI4uBHhHXI3kMUbtmESFlEbeK75sjWbpgE5AgiaOy0ueh8UYmaVy/Je8o0o6WydLEBgF7yetBYXeKhg3c1iVk7gLcH6FqGlCAABKYogqTBUehQYatJp8hQEXQWJBispf3V8utHiR9BKo9Wvz+tbv9z//X///+n//uSZLUKhB8rUTtvM2Iziqq6PCJ+kHS7QE280sDJhunodjACDYcEigAACoGTCjCdoyG1mpomkayPHADowMgkSQ/BoKYagDACEAD9LQgNfRcpoSBFKFjTfpVOA6F1KZQF6GIu01GPwwy1fVO7t5xlow+wADj4ZEYsgg1HJFXTKHScghj8tVORHBGgWmin1ymhHnhUliJYjl+vtruXTuZwzIygnLzn9pZYW5fNnayPU9s9ACGkCU2NxLKKjCirZ+dWv1bhyeFkSUnmGTf915f5//F1L+//////////r0bn7/CPNOh2jsW7BUCaR0cKuFp5jAZtRISmB1IwwMDFV4I8pmq6upl4Q8w0aDuC3Umx0qByQozmwV4uxoBgsxfmtUN86yr1Y3R47a7ZS1jupZX0GCyJ9HCvb7Bk6lFY7fkP3kUXfq0+75PjodqyafdPPNbL/Yfd0n67+9v71SE67vab0onfOAkAFOXApLMoERFOELLqs2ytjqruNJCwkjX2/o7d9W4L/JXwHUtKafe5y+g+LvcWSFY0+06G6gAADNx0uGdjVv/7kmS9DgRJSVAbaR4iNEq62jAifo+o20RtPNEI1odqnBSIMqzEzReAc1Oaw9wvm+iAFdCsjcY+1ROTcQLyM9jKwqCkCQKiWpYzReC0A4g8lG0xiDz4MvnZQig4KwbjPAkQyhmrT4u4DiVYhpLVs3EsgB4vqvV/qcj+VCYsc4eKHBwA8Jppa2fp788HgM0LTtu+u+7v9dv2LlZiGs18ww1iF/GdOi+ZeUiycXh4kmd0zEYvUy1NtFhx8pCCAEMZAACQGwBAzVRKhxCiE9wBxIbNoHqc3kP7Pru79X///WBnmSDDdA/T/MUjnBFNxG0GTBz5kCGqwLdmmcLsAs9H1DO8DISTScB8xyvJicy+SmVyI6ZGF8QBLA0SbE6LyaTodJOzjP4tj1QFsPsfRWFCGkQFBtiNg+cmXOOOKx+ZLpPPlqNJReW21lYD9IhkdGqqtbau2tx9IeZw8jURQaL0jbGNvK53KQqMyOyRJj5UOUljVBWLDBk7bfar0K/zn+Xv485fJqy/mRdZlLmU7aVzIb0cc2CIROgS4pACEAuKm11MJpX/+5Jkw4YFBVfRG0w2ki5BKv0N6TCVcWlO7L2L2LIErCg0sJpdfAQdxrlsYwIqXeihH/Tn6lf88ZNyazQwYc////+cIQCZQIAKclRA6VwRsuYzxJhbgbxzi5nGkCtM05O8My8dQOFyrzDL+DQJaHAqgPcB0lTqwpISm0HHOnvIKaNjvjeMi/hX7FlGNBJqpCH/9Q1Lw+dR+ZH9RndzghWS8b+W1z66Xetxtp6n97v+M183b+Okra7ZnnhnLqawmQrhhAABKTl84Z0yAIOQm6iYR3LHl+mCiu9wGWYT9rlWOxznJ//Zr6v//2S2tM8BQgIQSAAACrcm8SFbsJPHBprkRC56t0Ovu/0gbWhJ6sPG16xqRwW7tiEI070mMovdWMWBkgzEAQ9XyWaX7QfwL+JFexYkVMxIUbfyxOE9/VgorIiIhw4gchnMgAZrqRWcI+EWvw/n4uZTMKwCzTtEOJsTg3tuEPhN/LNBstZwzh91GykIATZQAAKT4qBhNxfS7dExDP6cfLKYx0WtXlYQ4T8ftiilQvNgN+voxX1Pd//fnn6P//uSZK8AA+la2NHsM7YtIfrnGCNQkFUNW6w8bcjOCGw1h5gy//2KCAiQgEluViBzBdkKEwBbuQ0RA32jxaBuqdA3lQSWcVzAvHmgVYcLpQNERhnjXd1mzqsvE8Ws/O62Ypu47mBOs+Skf9nxdFqnPrBi+5YX7wwMGK+2AIAanjVeN428ruIp5lblIRdqmpEhfqv0kU+xuVhwBbqV0oHgki0xak84cZWB09Pxh0YpvPc7wzI4SCkpJzpsc6SOpuAcE79OTxtfamnJ/d//d/k////4nAABhw6e/iYAmZtYaLICuZghZiLgl/LqpqBl4OApqFuTEgHPkE2rUm5K4GQBuOsGuRShMVeoyCJiiqLtMFYTADTQYTbOxKLt0gKNoaGnICQRpceuS2JxIDAfZLLd0pavc5YZXMnIIl5c3LZwCoeM1yjqsm1ysBv9olc76lGAnLsQKM7YVgEfsWq4IQS33dya1KXt/oV6lRJ3KGEt5b5gUCCpx6MpvYWBOYAUONOVXVjjEsq7LQ9k84Wi3RVNazdv/0MAOloCAAACcwwBmJDiHP/7kmS9gIOxV1jR5h6WNaO69yQrkpORX0hNMFqQnSCs5KALl84xDMDPjAgQvSZClGChCt6C4OCG4vy/Y0CyyGXgh+JrpZwYWCRtN8daJUhbVApRxJZEK9EoelGaJGcMPCSgxTJZI759hdnFPI8W8zPX2t2zNKFgss1iwWUYdQxsSDvgUqimX6ofLS38P1eJD59ovufpDhWLq7XjG1cpo42gF1hlhjnQMADwIQlDqDYOKA8Gl0jZ2cFq4ArfVWy8X7enRplnCxUv5iLZnwFFT654t31p+W//Thlv1wAnL4FMOaM+cOXDKqASGJZJXxZoDvIKkHPIsZMUa5n8jFZDHwGPpGjqhKBaRLOh6qPJ8tsyFNbyNK+u/KpDl7fbX+KCFVDBwLNlMFArk/0TsZKDCjjZwQhyo2MHxnCdquRrvSzW8xabvLnyFmuzud23bP++gCrBvKct4mIhygLwA/NB8P1Y2IW6IMf16BTJAbwP1eciRjrPqM0DsTvMRsYfRNhV87SNDf7f/o/42gAAZNWMH8EiEKY4AaZIAmAKXGFfmFGl4m7/+5JkxIrEdUtTO29EwDNDCnIwxZIOjLlPTTxryOUMKUjxpcDJRgVz0Jojg9pBUk5KJFok5HMYS5Jeolonpe1If6hXDawoacD9Vv2ddqJFRWJUME8CNcsWoN6tsOKdsB5i9fbNfKzC7hTdpzJl7ZPxNvE5/sncos1e58a0jVrWyY5TaxpIyoYfY03/nmABMkAOoAoYA2NAGBMOHRQGVCLAJM1rLeCJFRy6wgYFbVbHnZHQv0ao15QZZN+oAhoO/l+Wxf94LtC4AGljytjhmDizjDASdmbIWJdgIfbqDlYHcWwetMCaE4P86z9S6rRqyZgIBkH0nyHD0HaTRWyTowGY/blMo5UeQZrLgfrPFmYYriMGucSewo0wh4RCCq1Z2+rM8iAPHTztd1c7zOfP8wn/3fwQQ6Ysmdq+d3e/5vK+47K7+P4IEmKKm6rU0qXytEjWsdgY5AidtaYdQlBMNrFA402GXNc03dLVdf1f+/////Xg/rPVAABUumiTOcQSaYQgnUTBAg2GAaJNbEYcmFBaxmlMzqk5DDFWNA3hvhqMnEXB//uSZMuOpAw6UptPMvI3I6pzJSUekCzxRm09C8i9hioc9CVKXGgtkAOBEJllTD1MlQWZ5NcVsWDNV6QZJ1cztm2GpGreSC9ifk7iTVKDcq1UWkiZyHWBAnIcb5ktt6MfgjH4Jm/Z6dtPlz/3y/uON/Md6mkACQBBSdgbg1Eh1CA4Nng6xS63TBAOtKLDvBkBz6GGyNjJt6Lctd9Mhsl21f62P+KPl0f/6wgHaOCDW8gcmNKxGWpjlyGZioy3HZC7CLtJYApYgGXVJHrUYEIdOkW1RF6AmSci/LsuTYLieyuOg2FtPF+NJJiRI3KsBYDhdHm8SNG2C4yQMuhTpbrdidoitU1LvV/0+tuNMtpbiZzL6VUvWIywfDyhQsUjFLuLvesqgzIi98IBAAAMTokQdzkJREyFMwF2aZwpEoFVloZHCpLLTfYRz1aSx3c+VrG/9vuu2nzBn//bzj///29SAAGEbDd7UzMFMtSiUrMMBTPyAyddZwhkYsGBxaqrJy74KEYUoik2uASCIgzFkng/UNOIhKrCoFgQpUp8ykyhvQlEl//7kmTVhgPmK9KbTzLyNULKmj0jGo/sv0jtPNEA2RTp3PMVatYJyxtZzsr/a7Q021O5RJZnngSMN3NvkrJDetxIlmMwt8R/fJoCQAAXvW3qUm+vt/z6VIuZ+v7mUN7+x1X0zjr278VTfesg5+UzFPAQBXQGglA+BMolCESg8q4P5+eyJXc8mQaE3OeWbAjXLWWKLFDavo1TNev/6N/ExAEP8h/d6wSqi0cYZHgFR/VmZIDGUABkQKAVUOWy/5oZKYIEMgSTAwgECTqLuuLqBoQru4nFRNloLKTCfCewQGtbbjLoXBCDQ0KglhktrgS1Wl62clFUlzbdzvFyq4afZqtMR1DYHFnneRBBEZNCiQI/vOdgxZJ9w8+m8QPn9VnMoNNbSlTTT6OeczlHnnn2RT1zvZ29890Lb6Nm/nFB8aK+tpQALIlpCxoeGiS6imaLuTlUO0ugqJAsXstGv/2f2/Xb0Zv6N/GhQTV+LEPT/////8pVAAABdKpWcKiGlqx4oMYSRAKEMJIjGUIFH4GDDUhQcEy8JcpvQUGpquo0wUADEAL/+5Jk4I4EdkTRE29EZjVFSmMwxXYToWVCbbz3CMCVbLA3lFZwIfgCkBAjKoEjRKCJBnSLIIEjimrO0lEcCgeEBgl+Ux+hf8OXU2c5VU4z3Oe12o/2Ew1UiRbNrCg7wQ5ep5bMRVk63ndppZN01qYwjDAEu5JDkopKnxOfo7cs3n2SMXIHEZqfXZ8lxXTc0cIZKRASFPb8pJQoSQ3/PvmpsV/6wn5TJZGcWLi/G1v5ZSAoYsTmNhqreuiAXChUggg0hK1VhgWCWWavyoCjfT1/Yxfb//Mubb6YczIMDHtPdz7h/////HoKTpYEnEgmMFlqgUjXYnsqd8xQEnSFgDMHOirEpl0YsmABgdOyGLV3erq3tPZeWA483ZtetxF3HeTfWmz0aAPZEsK8GM0UvZY5goMajKqOOhkjihkAXRmSCWO1cVlRvLunUYvRGWkSD3xdEcrikXc8tNx2FXTUw5uEFII6YnDM40099GR6q1Q/xi9psmLJsn2K1sCgxz/Pq0MHlt4fvtF7F+L+ORT9T3DIEA8Ia63VtIAAM4BLgBgAOoGz//uSZNaKBildUJt5THAshUttHAbhliFzTu082sC1Cqx8t5WIcx1C42d13jSGYfiLUDWr7U9X+ElcgqEIWb//7/8UMdCZvE4ACgEAAAABSPoKzAotO5AYjwicmY36fQ8uhLWxF30WbKofpWlq0u9RRSOxWzKW71lgUvr1DD76YyZkMDy1ssOX5VOOm7LXYff8An2IKwhz7fTaGkLpefWMwa5ilc9ZK9W+0uz0yyUnt/bfZlfvep+fSa59er8gr/vrecTpPvuRdsb0pm6Vfza+a5mFHLZn8/vFPE9pqmTUJvoAAwBBDD3RwqnI3zk/sHTqoa48YIn9zSmVXXEFkBcz5JJiXuP/QCfe1IKa1I6//b1g0nYAX5CCI0KLg0gZ0IjQ0EVtEIIFAFbnHpldSCZoGICoCNuxFZMqGCXVd9sUGFo4RT1JfdiTApCmqNI6HtSkaA7zMppfI8VL9uA0Gn5lhTZJPBUA99NV01MRkkA0YSHqDsPzRvmrGHqis44fxG+ouWuKClbj9pUQB9a52dhQTY+Z20A3Zm3I9ppajB960TWWtf/7kGSthgTIWNXrLzaiMGP62RkCXhKlY1JNLLyIxg/sNGaJoKlEVXACIGSFbALgHVjV61ihsszg7iCTqistKjGu74mOteLEABBI9RjuYoEX/QU/q9Tf/9PpAERhDDIDGLjg2QBTDKhdsy4c1w8CHDCIx4OiAUA3hBoVw3glD5jgtdDWlYHKbsspaz2wS4RhRj2xWah+RPsns0+Hha4/TSs4AVsgqv2XCJYEFoMzword+vZSWGibFrNj/hAoVRrBVG6OQhIZK2q89HpQ/9P23m5WMdg6YrNLUdfredxdyR1/7OdebMmv789363faxbPZ+26+rv/chH7IkMKOkaAQAAAoO1OTmXk5Ye8bYiLP5qjyskWNGoJ45Hwg60Owj2yA38mnjOB4M+XuZnUyoYf8/OPQvocodH5kSroZk+p2b//8Sf+gmAI/////hkRrADlOZydmhkJ2IkZaijUQnMIY8wYQGAw3kODAmLAJAeQx4aUg+shTFArzws+FQV9LBJP2nEaegEHzWsxC+4sFu7FlirYOkBxIpVfZE7bkxtvTRAGjIP/7kmSkDgUcWNKLTBc2T4fqdz0llhRpWUZt5Q/IyRernDKp2of6ES61n9A3JQef3LsN3pWy59hEBMSqvyesfkNAFFRQ4lYeYDIEg6uq2bkmb5utZcfPPd0oc1//w7r/fNZ851952R1f/2js19EkuRoRWUQAIQcAvWAwZ1CxCyQLNYGZwai9QVPYqYMgT6N6t/rnfzv9yrs/4qkLusv1v/////2COkAQm5YLRJSpAXE21+M/MCQ07Oh4EupnF0xPHmb6qazsNZUM7buapmMF33asO/TwtyB4xG87CKZdxUgdGlSnQ1i8PJUO/trHgZMv3T5qPUIvbfT4IEh1uZcy9E9l/ooxZWB5dSohBBziI2Q6NygyqtEukcqeruVq1fU1NCs4xA5F6UFGlETKm4uRyOS1Ai7AxlJ91f6QyOSPtiIDukva/o9X/odw5yALPAeIXe9uNqUAAQXsi+ZsY2AnkF7UrC2xkqxFeGRxKRTgkDBoLRMfqYiC+ENoabss2KzzxtGjEBKLDxKTxPCNRijSgrgcjVwFUULYG8dEHECDJWfkp6X/+5JkfowECFhVmwst1C4iu0oESWiQHTdKbTBXCMiL6egWICD3avLLpQF2m23avekTfM2pu5l1VJnHySyptlK2vC0HBHOt6GZOqKj1jX1gnUcDOZnex1QC1AiAADADnA+lcfBNEEfw6M40NLAL1dgbZRuhZ6iOob/ucmmDx7lxRzw35f0ev//o9lUAAAJ0qBIEUzJy4LCgVQTRAJUYpDI7Q6YWKIS3QRbaIRAEAsTZkSaI4UwOlEp8qzLIozg/wPZeHy6N9hOU5DwQ0uaoTcx7nMrG5SMUI7E4/pqPaSR2orZt4NGpsoZ0ld3kvS4ALCjsakcLVPjeTq8M5/mqm308GAEeFYVIK0jhW6XHrtXom4oBBRCJVoPZqJCPEzE9ZRX8SlbiS4Njh7YXB4/qF0vD/dO2NjIneDVivX//7/O///9QOKqgR2NGWDo2ELkZCJGDB5hpcaUNAQKMwKRIDbEoUxgInEZW6zX3Bai194H/SbgJNVuy7SDqIVK2RAy00+A0lHZdEs06lNHHVRxlrYZiXULUcLa92NZ8Kw2VqIjczsch//uSZIwOBDA/UZtvG/AxorqqBegEkcDRQk3hi8jMjWjExaUQSZgPdOTpj32d8qqHoej+0MmDq7M7fi5jqfLOLus03BUON/9exN69l+L1d1RmwBE4CA7kQMBBPkRXdOpANR0iDxgiqB2fWXB0lnso2qXZs5tJ+rR/ruVeAnsJogunz3/+VQIAAAFUOKVNJpbpt5BqBpqZJKDNnfNEAIj48qB0VpUeZwzmRMRZypgiYulpECt3fVaTRKdroUFplCSeD+G/CoModZfQ5CcXeD3a9qBT1P9+Xx2/dS0tMmF3XEKeH39GovzuNbPxvZwZLdftmLKpoz7vyqWg4VWBVVrLiGmVI5Jb4jGxxtYpU28AChAACaAPhPlcvQW1F1fFb72uUqocLYaMiIG5uoaCqDdyivA6iV6YlUCVtXcLpif2f/9YWIhGgBkVReEmkwoDQ5MAInhZHmJRCCgWYEBxhkPNSZSF0qGMkGjsOa+sM8qlRQRcsVIhILJJNKfRORqL70bnwM4KYkXUxBQ52dfaaXqwSHolKYiyeYxHtRtwdrIQ0Y2Ekf/7kmSOigRANVE7TzVAM6MKaj0jcpGk+0BOYWvAyY2o1PGmgDc4KA4PrG7IdGVm8bmxTIQviK2dQd/77+nXU9thVh5QXALFhJK3LWt1btpGAAAeylIlRwLuKjeCNxoL/SmkbJJSz74+7Qo9/OkqlUfmiHonE/ax2WZFN9OvHnaM74oqAAALgT3OWjFDZ2kZqVRnHjDAoUNyXYIODwQVIBtGLUIB2ZkQnYXATBU1a0Ahu9RwtptI/LYAwDCqjuw1GGRyynSHEpSdtaPNQNmtp2YRZg/nTjEh4OkGQYASxc44hDjzhgNB9rnpVnx5e66m+qQiOa23Khcp1v74dXPUstkFdxG15wV73naWmDm9SAAUMBBDgdqA+H9vJwbBC5LNCvxRTAQTQLH07jCQeIRJbRP1nTU6wToPEj3Uuq1+v///QTNUGznEToyTiszDRiWIYdES7i8i+SQUmqFwqxi0YWDMLQ8a8+yYsNNPAwa3DEZa88kEiIIrS3+UATrbsNiisSWqJDlSmB82WwDehm1BVi5QC0NJNkH0aOMqzwIDobUu/7j/+5Jkj44EUz9Qm1ha8DNDWlotIz4RjSVCbSS6iMkSabTBlhjEvQLH57v+85G/dqilICndmdCU1XeceEw+Gj0Lp9beKKOTpgWjYrRHC3ukAAgAAAAMIoG/AmIP+2AEuW9bYTj169efWQ8FTxIJ1tbJtRC+gjmjEv3/3epAd/X///oqAABLljhjUBgC5xSiPqcBMlFRTqF6COBnD7YyajTcR4PzkLVUN5gqhqOE5HFcD6gLBYKweC87OCcchK0fq1ro7r43EyjIDwwPKXklpDISFol39YXzIQ0biyH8bfWCeO7+v7e+ba2U34XDhR5wTIl/0Y6/3lt+/2HAsVKZbKivFhgsOD1W6Oi8qKOlIs5zDgwdz2EoiO6vM3mVSGJCg4iuwsyJYVwHoS0n+dvsQ2o3/9Oz2TM6/sYzUgumF9Q7Vvd0KIQjCW5vk+n7593//Rh5gDCjXog+7KeCf//9gJmjhA4AEpS/iqZYKpQudaOTS0wcWv1X3l9yVaoXXp6lNVt9rWWHv3nK/lt8liQsYiiYboWH05Pffm3IaIwWtpMhubD+//uSZJAEBalj0xtPYlQqJSspCCaLl8GNXuwx9dCahK2wAKQmvNbSwWjmRgukvwMIb711qpyl0d73q+yVYLl19ZEU43OXncFKp9fpMsUl9VQqHkCE4fRoJIWNE8dTVSbAwQ7FJKrgvlpGtrMu3JTnQhjBl4loo+h6TwYiDrTankNclQ0kDLIeghBJXMz7GAUJdFeIuSh6rmKdd3bxHBYIsqqABBUIICg5LZRulBRCuCrT3vznGn+rh98RhkE/////93NWknXgy5sCAAAAKt0lcaAAPsJUtn0jV+h02dMUeVBNE2Oy5yGDROggB2WLSCPtjQagCrMv7AzsF8Jo1lVpjvXnhNStCBoQsyehHdxP564fqDuy2aNoYAlL/Z5aciWq8+ZUx4ciWfgzhj7/qXnopr32SBWIbn+mpSiuP//xF7bfHjErrJlq5uf+m8V7/xq1+7x7NcrPreROlp5r8o6LEU+PbOBLI3AQHDjVVksOAsldyjDLKp+p59028uOgwUG7NMSwGIZocnesvnSj2L5a9BPJDlEf/7gwAAAKkQLMLHBI6P/7kmRtAgT1YdW7DDagMCSq1SDDXg/k4V1MPQvAp7EtHHAf2tW1IhW96hqTJXGLAw2KdgPwJ5igPHNbgPHwsRiFjajneHcJmcgpMWIrEBlqYGIOk/Wd5mdkYYxnnDDr5vEAcGqWx544kHFZ4WYEMTAnW0RJbG1xzeKCnbpPsVickpTGEVGI1Cw5mSotQIQ3hxznxCnUdbtTAoACAAecb3oLFPRJ58nzDN/O3s39W+v/t2WjCEIiD5tP//4KhME4DihZBAAAAC8o8rxoBtCXiDpvuMFRue11pAyhp8w2tLDwPJDNeLS6BJ/KlAQVsNaeidjbys8sAV888UOQxSTVLOrXEiwrLPCJWONYk+qK1+FuWUSY93TXJMYFJDiR0NbslAZtZccIlre/m88H9z/vqXHPlnM5V7jattrW66kcYe9q0det3Eb+QaRidQiKiXEoaBACMBYAAZgmr1fphoXJhbAVA0MFc6CL5+B1OuTPtO3TiY77//P/q38TB/J+//DH/////6QAENRk0NDw01Qwqe5EdvETHHJg4MufRb8sd6fZWDT/+5JkcAIEbl1XOwsvIDQFW10hhZCQWWFhTBx8iMQZ7ehWChozEOT0igOitOCgmd6w3azQ0sbzRhkcB2IHqd3ML5UllzdXcJtSSMY/znauN1YDDtUmgRHBq7PpEUXHD5rPNFIvb3lAOTRWuY2h+lnypVBkU8NS1z/uOjHft5l76krzP5ilVO9VYFKT20CowK0MdzKpgmg6ZHFeXF/UbBJygnPTLUYi1cgVZFbwr/Ov/p/VW/r//8oT/oUAAPICwycX0B3AXlSsbQE3F0Ee2xhRGToDmnl9ailhs0F81An5iI8dnlwvCKBwmXssZzbSIV2Z8i43940rPCpFURQNDT6xzZ/Aj9Tcblu6O7+dJDRCXIM1Bkh2IGwZEQvF31qAiPyah89SLO/qnYyCtNa96LNdIyuddBVdyn4NAqkKyTq2lmB2wqVRWduX98bjAloK5TpN3UmoNE63NYrb5jJFT94t1h6v2nwWM3ZzdNCoCkv0M2o/VCvSN6vJe3/JE29rASFFppkRwyNGlqmYVEqChgdUZeSLNXhhRKBIKARFlFWWKNqa//uSZHQOxGQ6VJMpbxA0pBqwPWqGDwTPWG09cQDWkqpIwZaImHIyzpfqxYboBflEYb6BHJy4fUdFAeLRvthiQ20t5P7WHWAWXjmdIiGyR6O/y8/05n21G7/ZoEq8hmWxOIwQCB8yKEUgF9amIVDOlzHvw7fFABDBKwKDMfQzuU7jonOqLHStLg6e7LRZWLVtk9kLLBR0qg3sMPAgt0fHKn0A36DDu7/fxT/WAE1AApNy4wgB2H8BaPkLBEDJbiQOZ9lkeiNPlkP8p1e/VEXTfgklqKDcS8vVUszVaQjcL2fPWsJpU1PZMoRu/HdxYdg2+vvybO5iH1utHar+N47MR19QmYoofxuwFqHz3WNfb/lr0rxKWRn+TsZP/EE5P4AQCKBxcS/lvTqHKyr8qlEib2sFriUA9hIgmnjiBOmHJ9yvLoVBXcwBMsWZ4l6DvKv4t7/9IK2SBFJybwWRHSlYIpikgrOwRocOypwWdwhy4lq4ms2zxzdgZsKAn2KaqYg0alTkSEwcRES6ximkcLQ0Fl98NDjL2mvUofPc3fW1RG2UDP/7kmR7gMObV1lR6Rx2NQL6gz2GUg5FXWdMGRBY0pCpQPMWUMvB2lOqWtJ/Ez6vdX81X9jXn63Y82DSnQsuyor1Vj6firMtZdJdhO1fbC2uRpi5wjuXmSMiGWpFQXiuXRTQ/bpoc4rvYBgWqCcfAEBVfvn+rRDnijuHf8tVAB4glIuS5mJaBCYDiuQxVmzMr7Y34cB53HXk4LTHlQG1I/cc7YHhpzdqcItpmdu1nDdbfgnoQ3D+at32pBFVJvWmBWl+05pJnf/msIMHZ8arNTEnRAaPsghBWdqiO5qxptzdNyszMfAyG+63o7anJr6qO770Ik7wceGiBKQo7Fk8kozzoeLhhPHNCq0PLnJulzwqBhBZNEwMoqHxeOyXpyAiPhek1OuK6/G+/3/50ACAAASm5GED1Qkwo9IweKhSn8+KlCJbCwpX9yiULWeb5TSJ93Fa2oWlicI0WzxzeUqKJId6HgvtPhNUUdC1rIolIktIjQsP/tJETM3AwlHq/nIFILiEiad7m2pXJqh7Jy4xlkE4bQXSMNcJgYymCXkqzCGEQ07/+5JkkoDT01PY0w9D1jQkGmE8yIYNyPNdTD0LUM8KqYD2GVhEU7Kg/R0F6jYA6JWNaUtrkgw6MNh+iDIliVDv9RHlguFkuNXS7OBU12f5ZQACU3SEI3wyJwpyCpiW7Qi4SPiuFKlKGktfvPTK82o3pXVaq92o9TqVRy3EXtisth63VUukgRE0woBFarnDXIi2/Zt1kfcZmJdMbd1hgTomhKhcbLXBUYBJzWc6pGU80E96COoFj3LBwbnVl53/fdf+7uaMKKAAYFDrWDWGkTksbA/XJxi/HI3Ry4Opi5XePFOVlntAR6xWTKdAwX3aNeFR4/bCgVgMXQ5ilarv9FKJSWSNMBZw70KIxuwX/U1YuwV4WosSZaB4ZVEs/KpyFoMmhKPIhJN3SK7c9E8mWaue2h3gw6ZZmRMzX/Jqp7VKKMnl2glnHwqVw57r/sK/z/nlP8wBjg6FSJwi/izL8vHH/tPfj/Fc/eVCDxQXSEDSIs8D5TIrTiG0iu5GnaUArKJUyGak3q5tLVKYRJPnnSy00yZsUWx1IkurF8Xu/oUAAIyh//uSZKkK461FVZsmHbY4gvpiPMmUDVEJW0wwbVjTi+lEZ6QyRoOYGgDnUPFguHWi9Yyjb4oTIPFulkPQ/aaMdEhlKQxV8/1542oaEpVqQhp2ypD6KV6gESpi7JtFNeVOlrSsr9rQvLEUShHvyWDitymmhpFa3zMLuNdftS/CA4VEp8kmlchWDgu90SKlo2MN59zHqVc4XgABC+hJQktIUDyK8vigAxwB8ziPiyyyLtUKSEUcgc3pAWPtLIbj/PzTx6ousYauL3tSzuu/tBVzPgE0HRZ3kZiHYGPJ+CE1DQjAIGhYKgUcljGRkEPJfU5KVJ9TQUyCCOVKIB4ypMnaGgTqjakBDnZ5j8azkZXdKNzBLAUelW1a7Gp6Xln04AvoblOz6/3vsZn+fpcp4NtNqFXxA+s+1U1CxQfcLHEsdeZm6GPsgalBhQpgjrw5JkzXIHJDgFzLTpN2iBrSNCWP83VjbbVbJ/dDGSqAZEShxKt0Ksiye7r9ygAYEABKbsvrJWwESXy0unak9S3XsdQAgLngyvgp06mBZKXIiIAKOnMYaP/7kmTBDmO2LtObTzNgNgL6VT2GOg6QyU5tPMvA2IvpAYYlSA0qA5JJQ5W+FF3X9tuHSxh+OJXNqDqicX0luHFKCLsKMq2Er5hVYRl8jHXmckL755c/hynk2HfdWDhjBA8CcIHLh8woa9vLie4siVCyUR0yH6TdK0amE1JnSs0JBYd8ycKlUoIELYUwoSb0poLsgwMHmwTw5QJrmWt7LqPeAJAAABScrCys4PmbQMBQ1a1CG7yuMtszpWh1gNKlqoeil47vsJlQ4a755U9BHBSLc4zn6mrlFprYLPQnMzP78WyubNO6TZV/5heLfYrd8Pu11Hjrj/P45enq/+tml7GO9m2Oh4bdyBpuceg/4gYjkPJFAFG8KAAEoJkRMLFiIiJAyapx8RyGXIBqTak0NBULk3lCxaSaAb9aHGNrRiBHv0M/1QAAAoyC8HOgT8xrTaLMrAGtDiElB0TIRkEkBUhERphgrXwMA2FPd9UZWTxBG5ZRbdOVezCl+Pq8iw7jLvWaoc7bW5p7IfbsA8RwnHFGcXBofnZPLJimLalUrLcL85z/+5Jk1ACzgFBXUwka9jbjekA9IngNyOFbTDDNGNMMqZS0mLgweEj8BAUYMPMNt1dmKtagV/S+jfdAJxrL/4+3PjY/yZ/KLYRnNDvKdfh5utAQADbtw8MlVCiNsizAIUdg7zCH2fxB4T80lC+QvMJ1AkoqRg86k20kDKOZ08Ih81qxmEoTlJVF4/p6IS4REcKdhFn6VgMwIACU5I3UBMHMUGkMDR0LqoI39QAyABaNxKwlIk9CXjuJSLxSFFpZRL6EYsHHk9GnJK2Ky34WVpaexNtumM7Y1djOxu1cIdvf7TmsPKbZTZ2y/4ztGlW1zyqC44iIrciQlZNLF6Eszu5ve/pqZoH/S+tb6oLgB1HmdxSBs4FwCQAgUBvAApHJUV6uKS04OdK4wiPGqRr0o1IS70UBxnzYc20eWAmB1TokP29UfZ7r1QgAAAB2p/mUlB3KCLQhgw+DBcxExNCEWHrMMHCA5uQtLYtXEAc+juJeQ7HnzaKgrKXcRNSgLWhYFcYJwnJORgFiHyDdFCkykhH8hKQBZkoX0anUONncKG86ekth//uSZO4AtFUzUpssRhJEQ+o1YekcDoTZW0ywzZjxDOkA9iT4RWfyubiKDruLonWHCCMAiWYjd4v1r+fn6nNSvl65WfRE7lD5ep85nsQciqVTxW8mH2U0sgSzEVYmrOmOgZFCXxaA/krd1ksrjZOjPqPBmfjwjODkkkRAhhJuahrKXiOYu0WO3ZdnOVbvOKnzZ1S/+7oAIACUnIn+ZcKfEkJlwoUHQ4IDgIAw50H2LMtyeOVMbl0CgYeA+TVsrioHYDztOPIefclmRUFzXnV1uQE0r7LrrnNMpuUXkokcOxmKPnGHtX//IlEXI/p/em6GC7AaMpSK3u1liKyxkDEpdJacOtONLCC7CL4QBi7w0tRpXSdMtTqgRu8Qck4IjQn1EDTtlaUDQ5yVggZo1BvrnVEfhJUkFAddcq1q/p/1qgAAVLhwKmTjOc6LwBCQhExjAIGNzyDhaIgUIggkCYVDCwrhTwIRiDZdnMVijHyLQqS3DLCYIOqj9LgW5hJRpzNXS7O9OttmEqDicm2tO3wVIjtT0r6Ts7jNcSG4Goe9I4zgiv/7kmTtAORyTNI7bx0yPwPqMGGCeg6Qu1TtMM9Q0YwpTYSZUJyj8Ycp2w6IMjtWZCS+l+Rprwijod/llvn4J1U2SUqqyiN16gsAAVADbZULhwUGv5AZdeJs7QwHHyyEBDSQmlevMlhpU8XjllhTeXWltm4mW4ekIApJ2MVFdaJXfZkp/5Q2Kf1Au0soZxcdLSdhqY0EBhAGIKEFkCgauw0SVR9pydSSrLXOBFEKMgxhjhM2fF9CubQ30JXLehZlqAwmJzaXp5op0xH+Uyig4q26nVUS+MyazK42z6xqSYhws+fU47eFYy8W2nLmBvybS/++9ui//Qkpf025Ya0C9+uXV3/V6qJyImQXEVSgFI1BeCGdynmU5AcNVR1qZXMM6tb2yxP3qrb9Yjza7LSHBeTeOukvvO/nf1v/OcX8gQIGRo5zrE/66gAAAFCCUCkU1LYFTTYoy64MT4zPKc1AmOPJjliQxYGMwRzDBg7kGMMBCgqBwsj2QCCZ5hAeNAWDdsVKIAhiExTFxOALJOIl0I/I1KRbquN/ti3mFvGECaeq1mT/+5Jk8I7kQErSG48bcj9lajNhhU4PcJ1IdaeACQmQKEKw8ADfsMaeuZ35QhapN5YXEw3bkxi/DkZl0DW5ykl8poq771nYpIRQsQmKalzpJNVr6n+yvdeko21huD84XR3Z+KzH1rONLep4Xzmsee51+QNbgCHLDqTk/Xnqedu53Mcbs1epO4V9Xp6pccScp5A8cvht++v3W//////////w7r/7/////+/l9rEYdiWbcShi9V/59y5/////y5A3NcQwzSVzmshEFOzmMTYNaeO9bIDBxOAUZAVWASwoBL1hlQEhiIy9EyEYge0EHTNXgmmICDhldpUgAzDJp5GxqGu2/01AzhK9UwkKPznO4xOGVNIchli0lTin6erck8ZfWkf6I4S6LW39yfqB2cP7HJ3GpWs//ynuM9r/q1c7G8+3O/////lz////68LDDn/ziCYPl///UAHHHnz/////pQAXgAAC0kcZVG1xvYa0GUBcZdTLrMSa0zp+pmUv67IJBoma21UKGVxjlSRIkLOUsiFQqFRCKRShNCjsgoKfkd4KDfFB//uSZOyAB6BmUVZvAAChZ2mAzWAADwhjTT2EgAjiBai3kiAAXYgor4IL+QUbkFHcCgr4oU/EFd0FFfFBfyCRXAob4UFPjBR3QUb4KC/FBTcgUV4UE/CCn5AAE2kAAJyAD2qQikUs0ixZECQqaVFIBQICAhR6DIKgrBoFQVBXxEeiIGn+VBoO+JahLqZUewaxZ9VMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU="
    }
    const audio = document.createElement("audio")
    audio.src = this.sounds[type]
    audio.style.display = "none"
    document.body.appendChild(audio)

    this.playing = true

    try {
      await audio.play()
      await new Promise((resolve) => {
        audio.addEventListener("ended", resolve, { once: true })
      })
    } catch (e) {
      console.error("Ошибка воспроизведения:", e)
    } finally {
      this.playing = false
      audio.remove()
    }
  }
  async message() {}
}
const soundController = new SoundController()

class MessageManager {
  constructor() {
    this.target = document.querySelector("#divChatAreas")
    this.enemyName = ""
    this.activeObservers = []
    this.OBSERVER_TIMEOUT = 60000
    this.observer = null

    this.message = ["Принять вызов на бой?", "Предлагает обмен.", "Предлагает дружить."]
  }

  start() {
    this.searchMyName()
    this.test()
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.matches("div.post.mine")) {
            const messageTimeStr = node.querySelector(".time")?.textContent.trim()
            const dataTimeStr = document.querySelector("#divDockClock")?.textContent.trim()

            // с буквами - пропуск
            if (/[a-zа-яё]/i.test(messageTimeStr)) continue
            if (/[a-zа-яё]/i.test(dataTimeStr)) continue

            const currentMinutes = this.parseTime(dataTimeStr)
            const messageMinutes = this.parseTime(messageTimeStr)
            const diff = this.getTimeDifferenceInMinutes(currentMinutes, messageMinutes)

            // 1 минута ограничение по новым
            if (diff > 1) continue

            const label = node.querySelector(".users .label")
            const name = label?.textContent.trim()

            if (name && name !== meName) {
              soundController.play("message")
              this.enemyName = name
              showNotification("Сообщение", "Новое сообщение от " + this.enemyName)
              this.observeTextChanges(node)

              if (settings.get("antiBotEnable") === true && settings.get("variableAntiBot") === "stop") {
                bot.stop()
              }

              if (settings.get("antiBotEnable") === true && settings.get("variableAntiBot") === "pause") {
                bot.pause()
              }
            }
          }
        }
      }
    })

    this.observer.observe(this.target, {
      childList: true,
      subtree: true,
    })
  }

  observeTextChanges(messageNode) {
    const span = messageNode.querySelector("span.text")

    const observerEntry = {
      observer: null,
      timeoutId: null,
      span,
    }

    const disconnect = () => {
      observerEntry.observer.disconnect()
      clearTimeout(observerEntry.timeoutId)

      const index = this.activeObservers.indexOf(observerEntry)
      if (index !== -1) {
        this.activeObservers.splice(index, 1)
      }
    }

    observerEntry.observer = new MutationObserver(() => {
      soundController.play("message")
      clearTimeout(observerEntry.timeoutId)
      observerEntry.timeoutId = setTimeout(disconnect, this.OBSERVER_TIMEOUT)
    })

    observerEntry.observer.observe(span, {
      childList: true,
    })

    observerEntry.timeoutId = setTimeout(disconnect, this.OBSERVER_TIMEOUT)

    this.activeObservers.push(observerEntry)
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }

    for (const observerEntry of this.activeObservers) {
      observerEntry.observer.disconnect()
      clearTimeout(observerEntry.timeoutId)
    }

    this.activeObservers = []
  }
  searchMyName() {
    meName =
      document.querySelector("#divDockUser .trainer .label")?.textContent.trim() ||
      document.querySelector("#divOnline #divOnlineUser .trainer .label")?.textContent.trim() ||
      null
  }

  parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(":").map(Number)
    return hours * 60 + minutes
  }

  getTimeDifferenceInMinutes(currentMinutes, messageMinutes) {
    let diff = currentMinutes - messageMinutes
    if (diff < 0) diff += 1440 // переход через 00
    return diff
  }
  test() {
    const container = document.querySelector("#divAlerten")

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.matches(".alerten.info")) {
            const textAlert = node.querySelector(".divContent").textContent.trim()
            if (this.message.includes(textAlert)) {
              soundController.play("message")
              showNotification("Сообщение", "Новое сообщение от " + this.enemyName)

              if (settings.get("antiBotEnable") === true && settings.get("variableAntiBot") === "stop") {
                bot.stop()
              }

              if (settings.get("antiBotEnable") === true && settings.get("variableAntiBot") === "pause") {
                bot.pause()
              }
            }
          }
        }
      }
    })

    observer.observe(container, {
      childList: true,
    })
  }
}

let autoItem = null

const start = (async () => {
  const body = document.querySelector("body")
  const observer = new MutationObserver(() => {
    if (body.classList.contains("game")) {
      if (settings.get("antiBotEnable") === true) new MessageManager().start()

      autoItem = new AvtoItemAction()
    }
  })
  observer.observe(body, { attributes: true, attributeFilter: ["class"] })
})()
let currentHealModal = null

class CreateHeal {
  constructor() {
    this.startHeal = false
    this.currentRoute = null
    this.el = document.createElement("div")
    this.category = null
    this.noneRoute = null
  }

  createMenu() {
    this.open()
    this.el.classList.add("contanerHeal")

    const menu = document.createElement("div")
    menu.classList.add("menu")

    const header = document.createElement("div")
    header.classList.add("menu-header")

    const textTitle = document.createElement("span")
    textTitle.classList.add("header-title")
    textTitle.textContent = "Создание маршрута"

    const xMark = document.createElement("i")
    xMark.classList.add("fa-light", "icons-xmark")
    xMark.addEventListener("click", () => {
      this.close()
    })

    const separator = document.createElement("div")
    separator.classList.add("hr")

    const menuContent = document.createElement("div")
    menuContent.classList.add("menu-content", "custom-scroll")

    const text = document.createElement("div")
    text.classList.add("menu-text")
    text.textContent = `Для создания маршрута нажмите «Текущая локация». Начните с текущей позиции и последовательно отмечайте все локации маршрута, включая монстроцентр.`

    this.category = document.createElement("div")
    this.category.classList.add("category-content", "custom-scroll")

    this.createNone()

    const btnLocal = new Button({
      icon: "fa-light icons-locationPlus",
      text: "Текущая локация",
      onClick: () => {
        if (!this.startHeal) {
          this.startStepHeal()
        } else {
          this.stepHeal()
        }
      },
    })

    const saveRoute = new Button({
      icon: "fa-light icons-save",
      text: "Сохранить маршрут",
      onClick: () => {
        if (this.currentRoute?.route?.length > 0) {
          const existingRoutes = settings.get("spRoutHeal") || []
          existingRoutes.push(this.currentRoute)
          settings.set("spRoutHeal", existingRoutes)
          console.log("Маршрут сохранён:", this.currentRoute)
        }

        this.startHeal = false
        this.currentRoute = null
        this.clearCategory()
      },
    })
    const allRoutes = new Button({
      icon: "fa-light icons-list-drop",
      text: "Показать все маршруты",
      onClick: () => {
        const menuRoutesHeal = new Menu({
          title: "Маршруты лечения",
          text: "Нажатие на локацию мгновенно удаляет маршрут.",
          items: [
            {
              type: "viewHeal",
            },
          ],
        })
        menuRoutesHeal.open()
      },
    })

    const deleteRoute = new Button({
      icon: "fa-light icons-delete",
      text: "Удалить маршрут",
      red: true,
      onClick: () => {
        this.startHeal = false
        this.currentRoute = null
        this.clearCategory()
      },
    })

    this.el.append(menu)
    header.append(textTitle, xMark)
    menu.append(header, separator, menuContent)
    menuContent.append(text, this.category, btnLocal.el, saveRoute.el, allRoutes.el, deleteRoute.el)
    document.body.append(this.el)
  }

  startStepHeal() {
    this.currentRoute = {
      name: this.locName,
      route: [`btnGo${currentLocation}`],
    }

    this.startHeal = true
    this.addCategoryItem()
    console.log("Стартовая локация сохранена:", currentLocation)
  }

  stepHeal() {
    this.currentRoute.route.push(`btnGo${currentLocation}`)
    this.addCategoryItem()
    console.log("Добавлена точка:", this.currentRoute.route)
  }

  addCategoryItem() {
    const item = document.createElement("div")
    item.classList.add("category-item")
    item.textContent = this.locName

    if (this.noneRoute) {
      this.noneRoute.classList.remove("visible")
      this.noneRoute.classList.add("close")

      setTimeout(() => {
        this.noneRoute.remove()
        this.noneRoute = null

        this.category.append(item)
        requestAnimationFrame(() => {
          item.classList.add("visible")
        })
      }, 200)
    } else {
      this.category.append(item)
      requestAnimationFrame(() => {
        item.classList.add("visible")
      })
    }
  }

  open() {
    document.body.appendChild(this.el)
    this.el.classList.remove("close")

    requestAnimationFrame(() => {
      this.el.classList.add("open")
    })
  }

  close = () => {
    this.el.classList.remove("open")
    requestAnimationFrame(() => {
      this.el.classList.add("close")
      setTimeout(() => {
        this.el.remove()
        this.el.classList.remove("close")
      }, 200)
    })

    this.route = []
    this.startHeal = false
    this.clearCategory()

    modalManager.unregister(this)
  }

  createNone() {
    this.noneRoute = document.createElement("div")
    this.noneRoute.textContent = "Локация не указана"
    this.noneRoute.className = "category-item-none"

    requestAnimationFrame(() => {
      this.noneRoute.classList.add("visible")
    })
    this.category.append(this.noneRoute)
  }
  clearCategory() {
    this.currentRoute = null
    const items = this.category.querySelectorAll(".category-item")
    items.forEach((el) => {
      el.classList.remove("visible")
      el.classList.add("close")
    })
    setTimeout(() => {
      this.category.innerHTML = ""
      this.createNone()
    }, 200)
  }

  get locName() {
    return document.querySelector("#divLoc #divLocTitleContainer #divLocTitle #divLocTitleText")?.textContent.trim()
  }
}

class RouterViewHeal {
  constructor() {
    this.container = document.createElement("div")
    this.container.classList.add("routes-heal", "category-content", "custom-scroll")
    this.noneRoute = null
    this.execute()
  }

  execute() {
    this.container.innerHTML = ""
    this.noneRoute = null

    if (settings.get("spRoutHeal").length === 0) {
      this.createNone()
      return
    }

    settings.get("spRoutHeal").forEach((item, index) => {
      const location = document.createElement("div")
      location.classList.add("menuItem")
      location.textContent = item.name
      location.dataset.routeId = item.id || index
      location.addEventListener("click", () => {
        this.deleteRouteById(item.id || item.name, location)
      })
      this.container.append(location)

      requestAnimationFrame(() => {
        location.classList.add("visible")
      })
    })
  }

  deleteRouteById(routeId, locationElement) {
    const routes = settings.get("spRoutHeal")
    const index = routes.findIndex((route) => (route.id || route.name) === routeId)

    routes.splice(index, 1)
    settings.set("spRoutHeal", routes)

    locationElement.classList.remove("visible")
    locationElement.classList.add("close")

    setTimeout(() => {
      locationElement.remove()

      if (routes.length === 0) {
        this.createNone()
      }
    }, 200)
  }

  createNone() {
    this.noneRoute = document.createElement("div")
    this.noneRoute.textContent = "Маршрутов нет"
    this.noneRoute.className = "category-item-none"

    this.container.append(this.noneRoute)

    requestAnimationFrame(() => {
      this.noneRoute.classList.add("visible")
    })
  }
}
class AutoReklama {
  constructor() {
    this.observer = new BattleObserver()
    this.divChatWrap = document.querySelector("#divChatWrap")
    this.timer = null
    this.timerMs = 600000
  }
  async execute() {
    if (!settings.get("userAd")) {
      soundController.play("shine")
      showNotification("Реклама", "Укажите вашу рекламу")
      return
    }
    const textArea = this.divChatWrap.querySelector("#divInputFields textarea")

    while (settings.get("autoAdEnable") === true) {
      textArea.disabled = true
      const saveUsertextArea = textArea.value

      textArea.value = ""
      textArea.value = `*${settings.get("userAd")}*`

      const btnSend = this.divChatWrap.querySelector("#divInputButtons .btnSend")
      btnSend.click()
      await this.waitSend()
      textArea.disabled = false
      textArea.value = saveUsertextArea

      const divAlerten = document.querySelectorAll("#divAlerten .alerten.warning")
      if (divAlerten) {
        for (const el of divAlerten) {
          if (el.textContent.trim().includes("Следующее объявление вы сможете отправить через")) {
            const match = el.textContent.match(/через\s*(?:(\d+)\s*мин\.)?\s*(?:(\d+)\s*сек\.)?/)

            const [, min, sec] = match
            this.timerMs = ((+min || 0) * 60 + (+sec || 0)) * 1000

            break
          }
        }
      }

      this.timer = await GameUtils.delay(this.timerMs, this.timerMs + 1)
    }
  }
  waitSend() {
    const container = this.divChatWrap.querySelector("#divInputButtons .btnSend")
    return this.observer.observe(
      "waitAd",
      container,
      { attributeFilter: ["style"], attributes: true },
      (mutation) => mutation.type === "attributes" && mutation.attributeName === "style" && mutation.target.style.display !== "none"
    )
  }
  stop() {
    this.observer.disconnect("waitAd")
    if (this.timer) clearTimeout(this.timer)
  }
}

const autoAd = new AutoReklama()
