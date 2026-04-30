# Оптимизация prepareCommonArgs

`prepareCommonArgs` вызывается для каждой FSRS-карточки (4959 раз при сканировании, плюс при каждом рендеринге кнопки/статус-бара).

Внутри неё каждый раз выполняются:
- `parametersToJson(settings.parameters)` — сериализация одних и тех же параметров
- `now.toISOString()` — преобразование даты

Оптимизация:
- Закешировать `parametersToJson(settings.parameters)` — вычислять один раз и передавать в `prepareCommonArgs` или мемоизировать
- `now` вычисляется выше по стеку, можно передавать `nowStr` готовым
