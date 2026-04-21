#!/bin/sh
set -e

# Переменные окружения, которые должны быть заданы:
# CI_COMMIT_TAG   — тег релиза, например 1.2.3 или v1.2.3
# GITHUB_TOKEN    — персональный токен GitHub с правами на запись
# GITHUB_OWNER    — владелец репозитория (Evgene-Kopylov)
# GITHUB_REPO     — имя репозитория (fsrs_plugin)

VERSION="${CI_COMMIT_TAG#v}"   # убираем префикс v, если есть
RELEASE_FILES="main.js manifest.json styles.css"

echo "Preparing release ${CI_COMMIT_TAG} (version ${VERSION})"
echo "Release files: ${RELEASE_FILES}"

# 1. Проверяем, что все необходимые файлы существуют и не пусты
for file in $RELEASE_FILES; do
    if [ ! -f "$file" ]; then
        echo "ERROR: Required file $file not found. Aborting release."
        exit 1
    fi
    if [ ! -s "$file" ]; then
        echo "ERROR: File $file is empty (size 0). Aborting release."
        exit 1
    fi
    echo "File $file exists and is not empty."
done

# 2. Проверяем, существует ли уже релиз с таким тегом
echo "Checking if release ${CI_COMMIT_TAG} already exists..."
RESPONSE=$(curl -s -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${CI_COMMIT_TAG}")

RELEASE_ID=$(echo "$RESPONSE" | jq -r '.id')

if [ "$RELEASE_ID" != "null" ] && [ -n "$RELEASE_ID" ]; then
    echo "Release already exists with ID: ${RELEASE_ID}. Updating..."
    RESPONSE=$(curl -s -X PATCH \
        -H "Authorization: token ${GITHUB_TOKEN}" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/${RELEASE_ID}" \
        -d "{
            \"tag_name\": \"${CI_COMMIT_TAG}\",
            \"name\": \"Version ${VERSION}\",
            \"body\": \"Release ${CI_COMMIT_TAG} (updated)\",
            \"draft\": false,
            \"prerelease\": false
        }")
else
    echo "Creating new release..."
    RESPONSE=$(curl -s -X POST \
        -H "Authorization: token ${GITHUB_TOKEN}" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases" \
        -d "{
            \"tag_name\": \"${CI_COMMIT_TAG}\",
            \"name\": \"Version ${VERSION}\",
            \"body\": \"Release ${CI_COMMIT_TAG}\",
            \"draft\": false,
            \"prerelease\": false
        }")
    RELEASE_ID=$(echo "$RESPONSE" | jq -r '.id')
fi

if [ "$RELEASE_ID" = "null" ] || [ -z "$RELEASE_ID" ]; then
    echo "Failed to create or update release. Response:"
    echo "$RESPONSE" | jq .
    exit 1
fi

echo "Release ID: ${RELEASE_ID}"

# 3. Получаем upload_url
UPLOAD_URL=$(echo "$RESPONSE" | jq -r '.upload_url' | sed 's/{.*}//')
echo "Upload URL: ${UPLOAD_URL}"

if [ "$UPLOAD_URL" = "null" ] || [ -z "$UPLOAD_URL" ]; then
    echo "Failed to get upload URL"
    exit 1
fi

# 4. Загружаем файлы
for file in $RELEASE_FILES; do
    echo "Uploading $file..."

    # Определяем Content-Type
    CONTENT_TYPE="application/octet-stream"
    case "$file" in
        *.js) CONTENT_TYPE="application/javascript" ;;
        *.json) CONTENT_TYPE="application/json" ;;
        *.css) CONTENT_TYPE="text/css" ;;
    esac

    # Удаляем старый asset, если существует
    echo "Checking for existing $file asset..."
    ASSET_ID=$(curl -s -H "Authorization: token ${GITHUB_TOKEN}" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/${RELEASE_ID}/assets" \
        | jq -r ".[] | select(.name == \"$file\") | .id")

    if [ "$ASSET_ID" != "null" ] && [ -n "$ASSET_ID" ]; then
        echo "Deleting existing asset ID: ${ASSET_ID}"
        curl -s -X DELETE \
            -H "Authorization: token ${GITHUB_TOKEN}" \
            -H "Accept: application/vnd.github.v3+json" \
            "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${ASSET_ID}"
    fi

    # Загружаем новый asset
    UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Authorization: token ${GITHUB_TOKEN}" \
        -H "Content-Type: ${CONTENT_TYPE}" \
        -H "Accept: application/vnd.github.v3+json" \
        --data-binary @"$file" \
        "${UPLOAD_URL}?name=$file")

    HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n1)
    BODY=$(echo "$UPLOAD_RESPONSE" | head -n -1)

    if [ "$HTTP_CODE" = "201" ]; then
        echo "Successfully uploaded $file"
    else
        echo "Failed to upload $file. HTTP code: ${HTTP_CODE}"
        echo "Response: $BODY" | jq . 2>/dev/null || echo "$BODY"
        exit 1
    fi
done

echo "Release process completed for ${CI_COMMIT_TAG}"
