-- ============================================================
-- DU LỊCH THÔNG MINH VIỆT NAM - DATABASE SCHEMA
-- Platform: Supabase (PostgreSQL)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- NHÓM 1: USER MANAGEMENT
-- ============================================================

CREATE TABLE USERS (
    USER_ID         UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    FULL_NAME       VARCHAR(100)    NOT NULL,
    PASSWORDHASH    VARCHAR(255)    NOT NULL,
    EMAIL           VARCHAR(255)    NOT NULL UNIQUE,
    SOCIAL_ID       VARCHAR(255)    NULL,
    REGISTER_TYPE   VARCHAR(50)     NOT NULL CHECK (REGISTER_TYPE IN ('EMAIL', 'CREDENTIALS', 'SOCIAL')),
    ROLE            VARCHAR(50)     NOT NULL DEFAULT 'USER',
    STATUS          VARCHAR(20)     NOT NULL DEFAULT 'PENDING' CHECK (STATUS IN ('ACTIVE', 'INACTIVE', 'BANNED', 'PENDING')),
    CREATE_AT       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UPDATE_AT       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX UX_USERS_SOCIAL_ID ON USERS(SOCIAL_ID) WHERE SOCIAL_ID IS NOT NULL;

-- ============================================================

CREATE TABLE USER_PROFILES (
    PROFILE_ID          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    USER_ID             UUID            NOT NULL UNIQUE REFERENCES USERS(USER_ID),
    FULL_NAME           VARCHAR(255)    NOT NULL,
    AVATAR_URL          TEXT            NULL,
    BIO                 VARCHAR(500)    NULL,
    DATE_OF_BIRTH       DATE            NOT NULL,
    GENDER              VARCHAR(20)     NOT NULL CHECK (GENDER IN ('MALE', 'FEMALE', 'OTHER')),
    BASE_LOCATION       VARCHAR(100)    NULL,
    TRAVEL_STYLE        VARCHAR(50)     NULL CHECK (TRAVEL_STYLE IN ('BACKPACKER', 'RESORT')),
    PRIVACY_STATUS      VARCHAR(50)     NOT NULL DEFAULT 'PUBLIC' CHECK (PRIVACY_STATUS IN ('PUBLIC', 'PRIVATE')),
    IDENTITY_DOC_URL    TEXT            NULL,
    SELFIE_URL          TEXT            NULL,
    KYC_STATUS          VARCHAR(20)     NOT NULL DEFAULT 'UNVERIFIED' CHECK (KYC_STATUS IN ('UNVERIFIED', 'PENDING', 'APPROVED', 'REJECTED')),
    UPDATED_AT          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================

CREATE TABLE USER_SESSIONS (
    SESSION_ID          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    USER_ID             UUID            NOT NULL REFERENCES USERS(USER_ID),
    DEVICE_ID           VARCHAR(255)    NOT NULL,
    REFRESH_TOKEN_HASH  VARCHAR(512)    NOT NULL,
    IS_REVOKED          BOOLEAN         NOT NULL DEFAULT FALSE,
    EXPIRES_AT          TIMESTAMPTZ     NOT NULL,
    CREATED_AT          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NHÓM 2: ENTERPRISE
-- ============================================================

CREATE TABLE ENTERPRISE_PROFILES (
    ENTERPRISE_ID   UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    USER_ID         UUID            NOT NULL REFERENCES USERS(USER_ID),
    BUSINESS_NAME   VARCHAR(255)    NOT NULL,
    CONTACT_PERSON  VARCHAR(255)    NOT NULL,
    CONTACT_EMAIL   VARCHAR(50)     NOT NULL,
    CONTACT_PHONE   VARCHAR(10)     NOT NULL,
    CREATED_AT      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UPDATED_AT      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    STATUS          VARCHAR(20)     NOT NULL DEFAULT 'PENDING' CHECK (STATUS IN ('PENDING', 'ACTIVE', 'REJECTED'))
);

-- ============================================================

CREATE TABLE VERIFICATION_LOGS (
    LOG_ID          SERIAL          PRIMARY KEY,
    ENTERPRISE_ID   UUID            NOT NULL REFERENCES ENTERPRISE_PROFILES(ENTERPRISE_ID),
    ADMIN_ID        UUID            NOT NULL REFERENCES USERS(USER_ID),
    ACTION          VARCHAR(20)     NOT NULL CHECK (ACTION IN ('APPROVE', 'REJECT')),
    REASON          VARCHAR(255)    NULL,
    CREATED_AT      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NHÓM 3: REFERENCE DATA
-- ============================================================

CREATE TABLE REFERENCE_MASTER_DATA (
    REF_CODE    VARCHAR(50)     PRIMARY KEY,
    REF_TYPE    VARCHAR(50)     NOT NULL,
    REF_VALUE   VARCHAR(255)    NOT NULL,
    IS_ACTIVE   BOOLEAN        NOT NULL DEFAULT TRUE
);

-- ============================================================

CREATE TABLE TAGS (
    TAG_ID      SERIAL          PRIMARY KEY,
    TAG_NAME    VARCHAR(50)     NOT NULL UNIQUE
);

-- ============================================================

CREATE TABLE CATEGORIES (
    CATEGORY_ID     SERIAL          PRIMARY KEY,
    CATEGORY_NAME   VARCHAR(50)     NOT NULL UNIQUE
);

-- ============================================================

CREATE TABLE CITIES (
    CITY_ID     SERIAL              PRIMARY KEY,
    CITY_NAME   VARCHAR(255)        NOT NULL UNIQUE,
    REGION      VARCHAR(100)        NOT NULL,
    COUNTRY     VARCHAR(100)        NOT NULL DEFAULT 'VIETNAM',
    DESCRIPTION VARCHAR(255)        NULL,
    IMAGE_URL   VARCHAR(500)        NULL,
    LATITUDE    NUMERIC(10, 6)      NOT NULL CHECK (LATITUDE >= -90 AND LATITUDE <= 90),
    LONGITUDE   NUMERIC(10, 6)      NOT NULL CHECK (LONGITUDE >= -180 AND LONGITUDE <= 180),
    IS_ACTIVE   BOOLEAN             NOT NULL DEFAULT TRUE,
    CREATED_AT  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    UPDATED_AT  TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NHÓM 4: USER PREFERENCES & HISTORY
-- ============================================================

CREATE TABLE PREFERENCE_TAG_WEIGHTS (
    TAG_ID      INT             NOT NULL REFERENCES TAGS(TAG_ID),
    USER_ID     UUID            NOT NULL REFERENCES USERS(USER_ID),
    WEIGHT      FLOAT           NOT NULL CHECK (WEIGHT >= 0.0 AND WEIGHT < 1.0),
    UPDATE_AT   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (TAG_ID, USER_ID)
);

-- ============================================================

CREATE TABLE CATEGORY_VISIT_HISTORY (
    CATEGORY_ID     INT             NOT NULL REFERENCES CATEGORIES(CATEGORY_ID),
    USER_ID         UUID            NOT NULL REFERENCES USERS(USER_ID),
    VISIT_COUNT     INT             NOT NULL DEFAULT 0 CHECK (VISIT_COUNT >= 0),
    LAST_VISIT      TIMESTAMPTZ     NOT NULL,
    PRIMARY KEY (CATEGORY_ID, USER_ID)
);

-- ============================================================
-- NHÓM 5: LOCATIONS
-- ============================================================

CREATE TABLE LOCATIONS (
    LOCATION_ID     UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    LOCATION_NAME   VARCHAR(255)    NOT NULL,
    LATITUDE        NUMERIC(10, 6)  NOT NULL CHECK (LATITUDE >= -90 AND LATITUDE <= 90),
    LONGITUDE       NUMERIC(10, 6)  NOT NULL CHECK (LONGITUDE >= -180 AND LONGITUDE <= 180),
    CITY_ID         INT             NOT NULL REFERENCES CITIES(CITY_ID),
    OPEN_TIME       TIME            NOT NULL,
    CLOSE_TIME      TIME            NOT NULL CHECK (CLOSE_TIME > OPEN_TIME),
    MIN_PRICE       NUMERIC(18, 2)  NOT NULL CHECK (MIN_PRICE >= 0),
    MAX_PRICE       NUMERIC(18, 2)  NOT NULL CHECK (MAX_PRICE >= MIN_PRICE),
    CURRENCY        VARCHAR(10)     NOT NULL DEFAULT 'VND' CHECK (CURRENCY IN ('VND', 'USD')),
    CREATE_AT       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UPDATE_AT       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT UQ_LOCATION_COORD UNIQUE (LATITUDE, LONGITUDE)
);

-- ============================================================

CREATE TABLE LOCATIONS_IMAGE (
    IMAGE_ID        SERIAL          PRIMARY KEY,
    LOCATION_ID     UUID            NOT NULL REFERENCES LOCATIONS(LOCATION_ID),
    URL             VARCHAR(500)    NOT NULL UNIQUE,
    DISPLAY_ORDER   INT             NOT NULL DEFAULT 1 CHECK (DISPLAY_ORDER > 0),
    UPDATE_AT       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================

CREATE TABLE LOCATION_TAGS (
    LOCATION_ID     UUID    NOT NULL REFERENCES LOCATIONS(LOCATION_ID),
    TAG_ID          INT     NOT NULL REFERENCES TAGS(TAG_ID),
    PRIMARY KEY (LOCATION_ID, TAG_ID)
);

-- ============================================================

CREATE TABLE LOCATION_CATEGORIES (
    LOCATION_ID     UUID    NOT NULL REFERENCES LOCATIONS(LOCATION_ID),
    CATEGORY_ID     INT     NOT NULL REFERENCES CATEGORIES(CATEGORY_ID),
    PRIMARY KEY (LOCATION_ID, CATEGORY_ID)
);

-- ============================================================

CREATE TABLE BUSINESS_LOCATION (
    BUSINESS_ID     UUID    NOT NULL REFERENCES ENTERPRISE_PROFILES(ENTERPRISE_ID),
    LOCATION_ID     UUID    NOT NULL REFERENCES LOCATIONS(LOCATION_ID),
    PRIMARY KEY (BUSINESS_ID, LOCATION_ID)
);

-- ============================================================

CREATE TABLE LOCATION_STATS (
    STAT_ID             BIGSERIAL       PRIMARY KEY,
    LOCATION_ID         UUID            NOT NULL REFERENCES LOCATIONS(LOCATION_ID),
    TOTAL_VIEWS         BIGINT          NOT NULL DEFAULT 0,
    TOTAL_CHECKINS      BIGINT          NOT NULL DEFAULT 0,
    COMPLETION_RATE     REAL            NOT NULL DEFAULT 0 CHECK (COMPLETION_RATE >= 0 AND COMPLETION_RATE <= 100),
    RECORDED_AT         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NHÓM 6: PLANNING & ITINERARY
-- ============================================================

CREATE TABLE PLANNING_SESSIONS (
    SESSION_ID      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    USER_ID         UUID            NOT NULL REFERENCES USERS(USER_ID),
    CITY_ID         INT             NOT NULL REFERENCES CITIES(CITY_ID),
    PAX_ADULT       INT             NOT NULL DEFAULT 1 CHECK (PAX_ADULT > 0),
    PAX_CHILDREN    INT             NOT NULL DEFAULT 0,
    BUDGET          NUMERIC(18, 2)  NOT NULL CHECK (BUDGET > 0),
    CURRENCY        VARCHAR(10)     NOT NULL DEFAULT 'VND' CHECK (CURRENCY IN ('VND', 'USD')),
    START_DAY       DATE            NOT NULL,
    END_DAY         DATE            NOT NULL CHECK (END_DAY >= START_DAY),
    STATUS          VARCHAR(20)     NOT NULL DEFAULT 'PENDING' CHECK (STATUS IN ('PENDING', 'SUGGESTING', 'CONFIRMED', 'CANCELLED')),
    CREATE_AT       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================

CREATE TABLE REQUEST_HISTORY_LOGS (
    LOG_ID          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    SESSION_ID      UUID            NOT NULL REFERENCES PLANNING_SESSIONS(SESSION_ID),
    ACTION_TYPE     VARCHAR(20)     NOT NULL CHECK (ACTION_TYPE IN ('CREATE', 'RE_INPUT', 'CANCEL')),
    STATE_BEFORE    TEXT            NULL,
    CREATE_AT       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================

CREATE TABLE TRAVEL_REQUEST_PREFERENCES (
    SESSION_ID      UUID    NOT NULL REFERENCES PLANNING_SESSIONS(SESSION_ID),
    TAG_ID          INT     NOT NULL REFERENCES TAGS(TAG_ID),
    PRIMARY KEY (SESSION_ID, TAG_ID)
);

-- ============================================================

CREATE TABLE ITINERARIES (
    ITINERARY_ID        UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    SESSION_ID          UUID            NOT NULL REFERENCES PLANNING_SESSIONS(SESSION_ID),
    USER_ID             UUID            NOT NULL REFERENCES USERS(USER_ID),
    NAME                VARCHAR(255)    NULL,
    STATUS              VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' CHECK (STATUS IN ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
    TOTAL_BUDGET        NUMERIC(18, 2)  NOT NULL CHECK (TOTAL_BUDGET >= 0),
    CURRENCY            VARCHAR(10)     NOT NULL DEFAULT 'VND' CHECK (CURRENCY IN ('VND', 'USD')),
    TOTAL_TRAVEL_TIME   INT             NOT NULL CHECK (TOTAL_TRAVEL_TIME >= 0),
    TOTAL_DISTANCE      NUMERIC(10, 2)  NOT NULL CHECK (TOTAL_DISTANCE >= 0),
    CREATE_AT           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UPDATE_AT           TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================

CREATE TABLE ITINERARY_DAYS (
    DAY_ID              SERIAL          PRIMARY KEY,
    ITINERARY_ID        UUID            NOT NULL REFERENCES ITINERARIES(ITINERARY_ID),
    DAY_ORDER           INT             NOT NULL CHECK (DAY_ORDER > 0),
    TRAVEL_DATE         DATE            NOT NULL,
    ESTIMATED_BUDGET    NUMERIC(18, 2)  NOT NULL CHECK (ESTIMATED_BUDGET >= 0),
    CURRENCY            VARCHAR(10)     NOT NULL DEFAULT 'VND' CHECK (CURRENCY IN ('VND', 'USD')),
    TOTAL_TIME          INT             NOT NULL CHECK (TOTAL_TIME >= 0)
);

-- ============================================================

CREATE TABLE ITINERARY_STOPS (
    STOP_ID         SERIAL          PRIMARY KEY,
    DAY_ID          INT             NOT NULL REFERENCES ITINERARY_DAYS(DAY_ID),
    LOCATION_ID     UUID            NOT NULL REFERENCES LOCATIONS(LOCATION_ID),
    STOP_ORDER      INT             NOT NULL CHECK (STOP_ORDER > 0),
    ARRIVAL_TIME    TIME            NOT NULL,
    DEPARTURE_TIME  TIME            NOT NULL CHECK (DEPARTURE_TIME > ARRIVAL_TIME),
    CHECKIN_RADIUS  INT             NOT NULL DEFAULT 100,
    REWARD          INT             NOT NULL DEFAULT 0 CHECK (REWARD >= 0),
    STATUS          VARCHAR(20)     NOT NULL DEFAULT 'PENDING' CHECK (STATUS IN ('PENDING', 'VISITING', 'COMPLETED', 'SKIPPED'))
);

-- ============================================================

CREATE TABLE ITINERARY_ROUTES (
    ROUTE_ID        SERIAL          PRIMARY KEY,
    FROM_STOP_ID    INT             NOT NULL REFERENCES ITINERARY_STOPS(STOP_ID),
    TO_STOP_ID      INT             NOT NULL REFERENCES ITINERARY_STOPS(STOP_ID),
    TRAVEL_TIME     INT             NOT NULL CHECK (TRAVEL_TIME >= 0),
    DISTANCE        NUMERIC(10, 2)  NOT NULL CHECK (DISTANCE >= 0),
    POLYLINE_DATA   TEXT            NOT NULL
);

-- ============================================================
-- NHÓM 7: TRACKING
-- ============================================================

CREATE TABLE CHECKIN_PROGRESS (
    PROGRESS_ID     SERIAL          PRIMARY KEY,
    USER_ID         UUID            NOT NULL REFERENCES USERS(USER_ID),
    STOP_ID         INT             NOT NULL REFERENCES ITINERARY_STOPS(STOP_ID),
    IS_COMPLETED    BOOLEAN         NOT NULL DEFAULT FALSE,
    CHECKIN_TIME    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    LATITUDE        NUMERIC(10, 6)  NOT NULL CHECK (LATITUDE >= -90 AND LATITUDE <= 90),
    LONGITUDE       NUMERIC(10, 6)  NOT NULL CHECK (LONGITUDE >= -180 AND LONGITUDE <= 180),
    CONSTRAINT UQ_CHECKIN UNIQUE (USER_ID, STOP_ID)
);

-- ============================================================

CREATE TABLE GPS_TRACKING_LOGS (
    LOG_ID          BIGSERIAL       PRIMARY KEY,
    PROGRESS_ID     INT             NOT NULL REFERENCES CHECKIN_PROGRESS(PROGRESS_ID),
    LATITUDE        NUMERIC(10, 6)  NOT NULL CHECK (LATITUDE >= -90 AND LATITUDE <= 90),
    LONGITUDE       NUMERIC(10, 6)  NOT NULL CHECK (LONGITUDE >= -180 AND LONGITUDE <= 180),
    TRACKING_TIME   TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================

CREATE TABLE DEVIATION_LOGS (
    ALERT_ID        SERIAL          PRIMARY KEY,
    ITINERARY_ID    UUID            NOT NULL REFERENCES ITINERARIES(ITINERARY_ID),
    LATITUDE        NUMERIC(10, 6)  NOT NULL CHECK (LATITUDE >= -90 AND LATITUDE <= 90),
    LONGITUDE       NUMERIC(10, 6)  NOT NULL CHECK (LONGITUDE >= -180 AND LONGITUDE <= 180),
    ALERT_TIME      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NHÓM 8: SYSTEM MANAGEMENT
-- ============================================================

CREATE TABLE ACTIVITY_LOG (
    LOG_ID          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    USER_ID         UUID            NOT NULL REFERENCES USERS(USER_ID),
    ACTION          VARCHAR(100)    NOT NULL,
    STATUS          VARCHAR(50)     NOT NULL,
    IP_ADDRESS      VARCHAR(45)     NULL,
    USER_AGENT      VARCHAR(500)    NULL,
    CREATED_AT      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================

CREATE TABLE SYSTEM_SETTINGS (
    SETTING_ID      SERIAL          PRIMARY KEY,
    CONFIG_KEY      VARCHAR(100)    NOT NULL UNIQUE,
    CONFIG_VALUE    TEXT            NOT NULL,
    UPDATED_BY      UUID            NOT NULL REFERENCES USERS(USER_ID),
    UPDATE_AT       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================

CREATE TABLE SYSTEM_METRICS (
    METRIC_ID       BIGSERIAL       PRIMARY KEY,
    CPU_USAGE       FLOAT           NOT NULL CHECK (CPU_USAGE >= 0 AND CPU_USAGE <= 100),
    RAM_USAGE       FLOAT           NOT NULL CHECK (RAM_USAGE >= 0 AND RAM_USAGE <= 100),
    API_LATENCY     FLOAT           NOT NULL CHECK (API_LATENCY >= 0),
    RECORDED_AT     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================

CREATE TABLE EXPORT_HISTORIES (
    EXPORT_ID       UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    USER_ID         UUID            NOT NULL REFERENCES USERS(USER_ID),
    FORMAT          VARCHAR(10)     NOT NULL CHECK (FORMAT IN ('excel', 'pdf')),
    FILE_URL        VARCHAR(500)    NOT NULL,
    STATUS          VARCHAR(20)     NOT NULL DEFAULT 'PROCESSING' CHECK (STATUS IN ('PROCESSING', 'COMPLETED', 'FAILED')),
    CREATED_AT      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================

CREATE TABLE USER_FEEDBACKS (
    FEEDBACK_ID     UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    USER_ID         UUID            NOT NULL REFERENCES USERS(USER_ID),
    FEEDBACK_TYPE   VARCHAR(50)     NOT NULL CHECK (FEEDBACK_TYPE IN ('BUG', 'SUGGESTION', 'REPORT')),
    CONTENT         TEXT            NOT NULL,
    STATUS          VARCHAR(50)     NOT NULL DEFAULT 'PENDING' CHECK (STATUS IN ('PENDING', 'PROCESSING', 'RESOLVED')),
    CREATED_AT      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
