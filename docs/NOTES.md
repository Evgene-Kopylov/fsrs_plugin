!# .agetnignore агент не должен редактировать этот файл.

# Dev notes

## TS линтер.

```bash
npm run lint
```

Исправить, что можно, автоматически
```bash
npx eslint src/ --fix 
```

## Version bump

```bash
npm version patch
git push --tags
```
- patch  1.0.0 → 1.0.1
- minor  1.0.0 → 1.1.0
- major  1.0.0 → 2.0.0

## Regrok

Собирает репозиторий в один агент-френдли файл

Проверить .regrokignore

```bash
npx repogrok
```
