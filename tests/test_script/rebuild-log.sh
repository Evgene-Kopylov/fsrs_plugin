#!/bin/bash

# Скрипт для пересборки плагина FSRS и получения файлов/логов
# Автоматически делает паузу для обновления Obsidian

set -e  # Прерывать выполнение при ошибках

# Настройки по умолчанию
VAULT_PATH=""
LOG_FILE=""
DELAY=5
VERBOSE=false

# Функция для вывода справки
print_help() {
    cat << EOF
Использование: $0 -v ПУТЬ_К_ХРАНИЛИЩУ -l ПУТЬ_К_ЛОГ_ФАЙЛУ [ОПЦИИ]

Обязательные параметры:
  -v, --vault-path ПУТЬ   Путь к хранилищу Obsidian
  -l, --log-file ПУТЬ     Путь к лог-файлу

Опции:
  -d, --delay СЕКУНДЫ     Задержка после сборки в секундах (по умолчанию: 5)
  -V, --verbose           Подробный вывод
  -h, --help              Показать эту справку

Примеры:
  $0 -v /home/user/my-vault -l /home/user/my-vault/logs/console-log.system.2026-05-06.md
  $0 -v /home/user/my-vault -l /home/user/my-vault/logs/console-log.system.2026-05-06.md -d 2 -V

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
        -h|--help)
            print_help
            exit 0
            ;;
        -*)
            echo "❌ Неизвестный параметр: $1"
            echo "Используйте $0 --help для справки"
            exit 1
            ;;
        *)
            echo "❌ Неизвестный аргумент: $1"
            echo "Используйте $0 --help для справки"
            exit 1
            ;;
    esac
done

# Проверка обязательных параметров
if [ -z "$VAULT_PATH" ]; then
    echo "❌ Не указан путь к хранилищу (-v / --vault-path)"
    echo "Используйте $0 --help для справки"
    exit 1
fi
if [ -z "$LOG_FILE" ]; then
    echo "❌ Не указан путь к лог-файлу (-l / --log-file)"
    echo "Используйте $0 --help для справки"
    exit 1
fi

log_message "🔧 Запуск пересборки плагина FSRS..."
verbose_log "Параметры:"
verbose_log "  Vault path: $VAULT_PATH"
verbose_log "  Log file: $LOG_FILE"
verbose_log "  Delay: $DELAY секунд"

# Проверка существования путей
echo "Проверка путей к файлам..."
if [ ! -d "$VAULT_PATH" ]; then
    echo "❌ Хранилище не найдено: $VAULT_PATH"
    exit 1
fi
if [ ! -f "$LOG_FILE" ]; then
    echo "❌ Лог-файл не найден: $LOG_FILE"
    exit 1
fi

PROJECT_ROOT="$(pwd)"
if [ ! -d "$PROJECT_ROOT" ]; then
    echo "❌ Директория проекта не найдена: $PROJECT_ROOT"
    exit 1
fi

echo "✅ Хранилище: $VAULT_PATH"
echo "✅ Лог-файл: $LOG_FILE"
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
if npm run build; then
    echo "✅ Плагин успешно пересобран"
else
    echo "❌ Ошибка при пересборке плагина"
    exit 1
fi

# Шаг 2: Пауза для обновления Obsidian
echo ""
log_message "⏳ Шаг 2: Ожидание обновления Obsidian ($DELAY секунд)..."
sleep "$DELAY"
echo "✅ Пауза завершена"

# Шаг 3: Получение файлов
echo ""
log_message "📄 Шаг 3: Получение логов..."

echo "--- Начало лога (последние 100 строк) ---"
tail -n 100 "$LOG_FILE"
echo "--- Конец лога ---"

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
echo "✅ Пересборка: завершена"
echo "✅ Пауза $DELAY секунд: выполнена"
echo "📁 Лог-файл: $(wc -l < "$LOG_FILE") строк"
echo "📦 Файлы плагина: проверены"
echo "================================"
echo ""
log_message "🚀 Готово! Плагин пересобран и логи собраны."

# Создание timestamp файла для отслеживания
TIMESTAMP_FILE="$PROJECT_ROOT/.last_rebuild_timestamp"
date '+%Y-%m-%d %H:%M:%S' > "$TIMESTAMP_FILE"
echo "🕐 Время пересборки сохранено в: $TIMESTAMP_FILE"

exit 0
