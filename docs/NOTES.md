!# .agetnignore агент не должен редактировать этот файл.

# Dev notes

## Regrok

Собирает репозиторий в один агент-френдли файл

Проверить .regrokignore

```bash
npx repogrok
```

## TS линтер

```bash
npm run lint
```

Исправить, что можно, автоматически

```bash
npx eslint src/ --fix 
```

## Version bump

```bash
npm version patch \
&& git push --tags \
&& git push
```

- patch  1.0.0 → 1.0.1
- minor  1.0.0 → 1.1.0
- major  1.0.0 → 2.0.0

## Git

### New barnch

```bash
branch_name="dev/$(date +%d-%b_%H%M)" \
&& git checkout -b "$branch_name" \
&& git push -u origin "$branch_name"
```

Обновить мейн перед переходом на него.
```bash
git fetch origin main:main && git switch main
```

## Terminal

```bash
export PROMPT_DIRTRIM=1
PS1='\w\$ '
```

с подкраской
```bash
export PROMPT_DIRTRIM=1
PS1='\[\033[01;34m\]\w\[\033[00m\]\$ '
```
