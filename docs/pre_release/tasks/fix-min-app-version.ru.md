# Задача 1: Поднять minAppVersion в manifest.json

## Описание

В `manifest.json` поле `minAppVersion` установлено в `"0.1.0"`, что слишком низко.
В README указаны минимальные требования Obsidian v0.15.0+.

## Что сделать

Изменить `minAppVersion` в `manifest.json` с `"0.1.0"` на `"0.15.0"`.

## Файл

`manifest.json`

## Текущее значение

```json
"minAppVersion": "0.1.0"
```

## Целевое значение

```json
"minAppVersion": "0.15.0"
```

## Чек-лист

- [ ] Изменить значение в `manifest.json`
- [ ] Синхронизировать с `README.md` (проверить, что минимальная версия совпадает)
- [ ] Синхронизировать с `README.ru.md`
