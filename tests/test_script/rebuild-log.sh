#!/bin/bash

# Скрипт для пересборки плагина FSRS и получения файлов/логов
# Автоматически делает паузу для обновления Obsidian

set -e  # Прерывать выполнение при ошибках

# Настройки по умолчанию
DEFAULT_VAULT_PATH="/home/death/Documents/FSRS-test-Obsidian-Vault"
DEFAULT_WELCOME_FILE="$DEFAULT_VAULT_PATH/Welcome.md"
DEFAULT_LOG_FILE="$DEFAULT_VAULT_PATH/console_logs/console-log.death-system.2026-04-19.md"
DEFAULT_DELAY=5

# Переменные, которые можно переопределить через аргументы
VAULT_PATH="$DEFAULT_VAULT_PATH"
WELCOME_FILE="$DEFAULT_WELCOME_FILE"
LOG_FILE="$DEFAULT_LOG_FILE"
DELAY="$DEFAULT_DELAY"
VERBOSE=false
DRY_RUN=false

# Функция для вывода справки
print_help() {
    cat << EOF
Использование: $0 [ОПЦИИ]

Скрипт для пересборки плагина FSRS и сбора логов из тестового хранилища.

Опции:
  -v, --vault-path ПУТЬ   Путь к хранилищу Obsidian (по умолчанию: $DEFAULT_VAULT_PATH)
  -w, --welcome-file ПУТЬ Путь к файлу Welcome.md (по умолчанию: \$VAULT_PATH/Welcome.md)
  -l, --log-file ПУТЬ     Путь к лог-файлу (по умолчанию: \$VAULT_PATH/console_logs/console-log.death-system.2026-04-19.md)
  -d, --delay СЕКУНДЫ     Задержка после сборки в секундах (по умолчанию: $DEFAULT_DELAY)
  -V, --verbose           Подробный вывод
  -n, --dry-run           Тестовый режим без фактической пересборки
  -h, --help              Показать эту справку

Примеры:
  $0 --vault-path /home/user/my-vault --delay 5
  $0 -v /home/user/my-vault -d 2 -V
  $0 --dry-run

EOF
}

# Функция для вывода сообщений с временной меткой
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Функция для подробного вывода
verbose_log() {
    if [ "$VERBOSE" = true ]; then
        echo "🔍 [VERBOSE] $1"
    fi
}

# Парсинг аргументов командной строки
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--vault-path)
            VAULT_PATH="$2"
            WELCOME_FILE="$VAULT_PATH/Welcome.md"
            LOG_FILE="$VAULT_PATH/console_logs/console-log.death-system.2026-04-19.md"
            shift 2
            ;;
        -w|--welcome-file)
            WELCOME_FILE="$2"
            shift 2
            ;;
        -l|--log-file)
            LOG_FILE="$2"
            shift 2
            ;;
        -d|--delay)
            DELAY="$2"
            shift 2
            ;;
        -V|--verbose)
            VERBOSE=true
            shift
            ;;
        -n|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            print_help
            exit 0
            ;;
        *)
            echo "❌ Неизвестный параметр: $1"
            echo "Используйте $0 --help для справки"
            exit 1
            ;;
    esac
done

# Обновление путей на основе vault-path
WELCOME_FILE="${WELCOME_FILE/\$VAULT_PATH/$VAULT_PATH}"
LOG_FILE="${LOG_FILE/\$VAULT_PATH/$VAULT_PATH}"

log_message "🔧 Запуск пересборки плагина FSRS..."
verbose_log "Параметры:"
verbose_log "  Vault path: $VAULT_PATH"
verbose_log "  Welcome file: $WELCOME_FILE"
verbose_log "  Log file: $LOG_FILE"
verbose_log "  Delay: $DELAY секунд"
verbose_log "  Verbose: $VERBOSE"
verbose_log "  Dry run: $DRY_RUN"

# Проверка существования путей
echo "Проверка путей к файлам..."
if [ ! -d "$VAULT_PATH" ]; then
    echo "❌ Хранилище не найдено: $VAULT_PATH"
    exit 1
fi

PROJECT_ROOT="$(pwd)"
if [ ! -d "$PROJECT_ROOT" ]; then
    echo "❌ Директория проекта не найдена: $PROJECT_ROOT"
    exit 1
fi

echo "✅ Хранилище: $VAULT_PATH"
echo "✅ Проект: $PROJECT_ROOT"

# Шаг 1: Пересборка плагина
echo ""
log_message "🔄 Шаг 1: Пересборка плагина (npm run build)..."
cd "$PROJECT_ROOT"

# Проверка существования package.json
if [ ! -f "package.json" ]; then
    echo "❌ Файл package.json не найден в $PROJECT_ROOT"
    exit 1
fi

# Выполнение сборки
if [ "$DRY_RUN" = true ]; then
    echo "✅ [DRY RUN] Пропуск фактической пересборки"
else
    if npm run build; then
        echo "✅ Плагин успешно пересобран"
    else
        echo "❌ Ошибка при пересборке плагина"
        exit 1
    fi
fi

# Шаг 2: Пауза для обновления Obsidian
echo ""
log_message "⏳ Шаг 2: Ожидание обновления Obsidian ($DELAY секунд)..."
if [ "$DRY_RUN" = true ]; then
    echo "✅ [DRY RUN] Пропуск ожидания"
else
    sleep "$DELAY"
    echo "✅ Пауза завершена"
fi

# Шаг 3: Получение файлов
echo ""
log_message "📄 Шаг 3: Получение файлов и логов..."

# Проверка и вывод содержимого Welcome.md
if [ -f "$WELCOME_FILE" ]; then
    echo "📁 Welcome.md найден: $WELCOME_FILE"
    echo "--- Начало Welcome.md (первые 30 строк) ---"
    head -n 30 "$WELCOME_FILE"
    echo "--- Конец Welcome.md ---"
    echo ""
    echo "📊 Информация о файле:"
    wc -l "$WELCOME_FILE" | awk '{print "Количество строк:", $1}'
    ls -lh "$WELCOME_FILE" | awk '{print "Размер:", $5, "Дата изменения:", $6, $7, $8}'
else
    echo "⚠️  Файл Welcome.md не найден: $WELCOME_FILE"
fi

echo ""

# Проверка и вывод содержимого лог-файла
if [ -f "$LOG_FILE" ]; then
    echo "📁 Лог-файл найден: $LOG_FILE"
    echo "--- Начало лога (последние 50 строк) ---"
    tail -n 50 "$LOG_FILE"
    echo "--- Конец лога ---"
    echo ""
    echo "📊 Информация о логе:"
    wc -l "$LOG_FILE" | awk '{print "Общее количество строк:", $1}'
    ls -lh "$LOG_FILE" | awk '{print "Размер:", $5, "Дата изменения:", $6, $7, $8}'

    # Поиск упоминаний FSRS в логе
    echo ""
    echo "🔍 Поиск упоминаний FSRS в логе:"
    if grep -i "fsrs" "$LOG_FILE" | head -n 10; then
        echo "✅ Найдены упоминания FSRS"
    else
        echo "⚠️  Упоминания FSRS не найдены"
    fi
else
    echo "⚠️  Лог-файл не найден: $LOG_FILE"
    echo "Поиск альтернативных лог-файлов..."
    find "$VAULT_PATH/console_logs" -name "console-log.*.md" -type f 2>/dev/null | head -n 5
fi

# Шаг 4: Проверка сборки плагина
echo ""
log_message "🔍 Шаг 4: Проверка результатов сборки..."

# Проверка существования основных файлов плагина
PLUGIN_FILES=("main.js" "manifest.json" "styles.css")
for file in "${PLUGIN_FILES[@]}"; do
    if [ -f "$PROJECT_ROOT/$file" ]; then
        size=$(ls -lh "$PROJECT_ROOT/$file" | awk '{print $5}')
        echo "✅ $file найден ($size)"
    else
        echo "⚠️  $file не найден"
    fi
done

# Проверка времени модификации main.js
if [ -f "$PROJECT_ROOT/main.js" ]; then
    mod_time=$(stat -c %y "$PROJECT_ROOT/main.js")
    echo "🕐 main.js последнее изменение: $mod_time"
fi

# Шаг 5: Сводка
echo ""
log_message "📋 Сводка выполнения:"
echo "================================"
echo "✅ Пересборка: $(if [ "$DRY_RUN" = true ]; then echo "DRY RUN"; else echo "завершена"; fi)"
echo "✅ Пауза $DELAY секунд: выполнена"
echo "📁 Welcome.md: $(if [ -f "$WELCOME_FILE" ]; then echo "найден"; else echo "не найден"; fi)"
echo "📁 Лог-файл: $(if [ -f "$LOG_FILE" ]; then echo "найден"; else echo "не найден"; fi)"
echo "📦 Файлы плагина: проверены"
echo "================================"
echo ""
log_message "🚀 Готово! $(if [ "$DRY_RUN" = true ]; then echo "[DRY RUN]"; else echo "Плагин пересобран и логи собраны."; fi)"

# Создание timestamp файла для отслеживания
if [ "$DRY_RUN" = false ]; then
    TIMESTAMP_FILE="$PROJECT_ROOT/.last_rebuild_timestamp"
    date '+%Y-%m-%d %H:%M:%S' > "$TIMESTAMP_FILE"
    echo "🕐 Время пересборки сохранено в: $TIMESTAMP_FILE"
fi

exit 0
