CREATE TABLE IF NOT EXISTS "UserLoginEvent" (
  "id"        TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserLoginEvent_pkey" PRIMARY KEY ("id")
);
