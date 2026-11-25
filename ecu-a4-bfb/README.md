# Audi A4 BFB — ME7.5 прошивки (8E0909518AQ / SW 372505)

Личные образы для ECU **8E0909518AQ**, Bosch **0261208524**, софт **372505**, двигатель **BFB 1.8T**.

> Сейчас в папке описание. Бинарники `.bin` появятся после повторной загрузки в чат (файлы на VM очистились).

## Какую лить

| Приоритет | Файл | Когда |
|---|---|---|
| **1 — лей это** | `FLASH_ME_SAFE_STREET.bin` | Стабильная уличная (~150% LDRXN), богаче смесь, без lope/попкорна. После красного коллектора на Angry. |
| осторожно | `FLASH_ME_ANGRY_CLEAN.bin` | Тяга как Always Angry (~163%), **без** ASM idle-lope и без popcorn. Может дёргать/греть на долгом WOT. |
| архив / не лей | `FLASH_ME_PROOF_ALWAYS_ANGRY.bin` | Оригинал Always Angry (md5 `74ba5f65390bc93a7073cf7b86e70b86`). ASM-hook → «кол» на 2-й + popcorn. |
| архив | `MAX_STABLE_168_*` / `ANGRY_PULL_165_*` / `STREET_REAL_165_*` / `SPORT_EVIL_250_*` | Промежуточные; Evil 220% резал на 3–4к. |

## Описание

### `FLASH_ME_SAFE_STREET.bin` (рекомендуется)
- База: Angry Clean
- LDRXN гладко **~150%** (без скачка 121→163)
- KFMIRL прижат (~205%)
- LAMFA / KFLBTS богаче (EGT)
- Лёгкий ретард KFZW на верхах
- Нет ASM lope, нет popcorn
- sha256: `968d0c11e1107c36b079f62da2e6fa418a7e0973c5205f6eeca410d3cb8e48ef`

### `FLASH_ME_ANGRY_CLEAN.bin`
- Карты stage из Always Angry
- Hook `@0xB8944` снят
- Popcorn KFZWOP убран
- sha256: `aded4797ba84ff877ee485269686762281c1f717c16f1f59050c3da1a91a563e`

### `FLASH_ME_PROOF_ALWAYS_ANGRY.bin`
- md5 `74ba5f65390bc93a7073cf7b86e70b86`
- Пик ~163% с ~1950 об/мин
- ASM idle-lope — не рекомендуется

## Железо
- Сток K03, лучше 98 бензин
- NMAX 6800, CDKAT=3
- Долгий WOT на 163% раскалял коллектор при нормальной ОЖ (это EGT)

## Логи
- **115** Soll/Ist
- **020** ретард (0…2° ок)
- **031** лямбда

## Disclaimer
Личное использование на своём ЭБУ, на свой риск.
