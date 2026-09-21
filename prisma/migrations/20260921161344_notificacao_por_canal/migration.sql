-- DropIndex
DROP INDEX "alert_notifications_alertId_kind_key";

-- CreateIndex
CREATE UNIQUE INDEX "alert_notifications_alertId_kind_channel_key" ON "alert_notifications"("alertId", "kind", "channel");

