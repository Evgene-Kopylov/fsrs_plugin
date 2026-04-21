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
