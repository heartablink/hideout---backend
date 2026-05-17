-- CreateTable
CREATE TABLE "activity_type" (
    "activity_id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "xp_reward" INTEGER NOT NULL,
    "description" VARCHAR(100) NOT NULL,

    CONSTRAINT "activity_type_pkey" PRIMARY KEY ("activity_id")
);

-- CreateTable
CREATE TABLE "admin_log" (
    "log_id" SERIAL NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "target_user_id" INTEGER NOT NULL,
    "action_type" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shift_id" INTEGER NOT NULL,

    CONSTRAINT "admin_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "booking" (
    "booking_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "room_id" INTEGER NOT NULL,
    "booking_date" DATE NOT NULL,
    "time_begin" TIME(6) NOT NULL,
    "time_end" TIME(6) NOT NULL,
    "status_id" INTEGER,
    "total_cost" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_sum" DECIMAL(15,2) DEFAULT 0.00,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("booking_id")
);

-- CreateTable
CREATE TABLE "branch_office" (
    "branch_id" SERIAL NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "ip_address" VARCHAR(50) NOT NULL,

    CONSTRAINT "branch_office_pkey" PRIMARY KEY ("branch_id")
);

-- CreateTable
CREATE TABLE "category" (
    "category_id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "deposit_transaction" (
    "transaction_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_balance" DECIMAL(15,2) NOT NULL,
    "booking_id" INTEGER,
    "admin_id" INTEGER NOT NULL,
    "operation_type_id" INTEGER NOT NULL,
    "external_transaction_id" VARCHAR(50),
    "comment" TEXT,

    CONSTRAINT "deposit_transaction_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "loyalty" (
    "user_id" INTEGER NOT NULL,
    "loyalty_level_id" INTEGER NOT NULL,
    "xp_amount" INTEGER NOT NULL DEFAULT 0,
    "current_balance" DECIMAL(15,2) NOT NULL DEFAULT 0.00,

    CONSTRAINT "loyalty_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "loyalty_level" (
    "level_id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "level_order" INTEGER NOT NULL,
    "discount" DECIMAL(5,2),
    "min_xp" BIGINT NOT NULL,

    CONSTRAINT "loyalty_level_pkey" PRIMARY KEY ("level_id")
);

-- CreateTable
CREATE TABLE "permission" (
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "price_id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "date_from" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_to" TIMESTAMP(6),
    "admin_id" INTEGER NOT NULL,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("price_id")
);

-- CreateTable
CREATE TABLE "role" (
    "role_id" SERIAL NOT NULL,
    "name_role" VARCHAR(50) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "room" (
    "room_id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "max_people" INTEGER NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "description" TEXT,
    "name" VARCHAR(50) NOT NULL,
    "image" TEXT,
    "is_active" BOOLEAN NOT NULL,
    "is_deleted" BOOLEAN NOT NULL,

    CONSTRAINT "room_pkey" PRIMARY KEY ("room_id")
);

-- CreateTable
CREATE TABLE "staff" (
    "user_id" INTEGER NOT NULL,
    "branch_id" INTEGER,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "status_booking" (
    "status_id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "status_booking_pkey" PRIMARY KEY ("status_id")
);

-- CreateTable
CREATE TABLE "type_operation" (
    "operation_id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "type_operation_pkey" PRIMARY KEY ("operation_id")
);

-- CreateTable
CREATE TABLE "user" (
    "user_id" SERIAL NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "salt" TEXT NOT NULL,
    "phone" VARCHAR(20) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_info" (
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "surname" VARCHAR(50) NOT NULL,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_info_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "work_shift" (
    "shift_id" SERIAL NOT NULL,
    "staff_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "opened_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(6),
    "ip_address" VARCHAR(50) NOT NULL,

    CONSTRAINT "work_shift_pkey" PRIMARY KEY ("shift_id")
);

-- CreateTable
CREATE TABLE "xp_log" (
    "log_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "xp_gain" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activity_type_id" INTEGER,

    CONSTRAINT "xp_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "game" (
    "game_id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "genre" VARCHAR(100),
    "image_url" TEXT,
    "category_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_pkey" PRIMARY KEY ("game_id")
);

-- CreateTable
CREATE TABLE "roomstatuslog" (
    "log_id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "reason" TEXT,
    "changed_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roomstatuslog_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "room_maintenance" (
    "maintenance_id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_maintenance_pkey" PRIMARY KEY ("maintenance_id")
);

-- CreateTable
CREATE TABLE "loyalty_package" (
    "package_id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN DEFAULT true,

    CONSTRAINT "loyalty_package_pkey" PRIMARY KEY ("package_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_unique" ON "user"("phone");

-- CreateIndex
CREATE INDEX "idx_room_status_created_at" ON "roomstatuslog"("created_at");

-- CreateIndex
CREATE INDEX "idx_room_status_room_id" ON "roomstatuslog"("room_id");

-- CreateIndex
CREATE INDEX "idx_maintenance_dates" ON "room_maintenance"("start_at", "end_at");

-- CreateIndex
CREATE INDEX "idx_maintenance_room_id" ON "room_maintenance"("room_id");

-- AddForeignKey
ALTER TABLE "admin_log" ADD CONSTRAINT "admin_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_log" ADD CONSTRAINT "admin_log_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "work_shift"("shift_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_log" ADD CONSTRAINT "admin_log_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("room_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "status_booking"("status_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "deposit_transaction" ADD CONSTRAINT "deposit_transaction_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "deposit_transaction" ADD CONSTRAINT "deposit_transaction_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("booking_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "deposit_transaction" ADD CONSTRAINT "deposit_transaction_operation_type_id_fkey" FOREIGN KEY ("operation_type_id") REFERENCES "type_operation"("operation_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "deposit_transaction" ADD CONSTRAINT "deposit_transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "loyalty" ADD CONSTRAINT "loyalty_loyalty_level_id_fkey" FOREIGN KEY ("loyalty_level_id") REFERENCES "loyalty_level"("level_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "loyalty" ADD CONSTRAINT "loyalty_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("role_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("room_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch_office"("branch_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("category_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch_office"("branch_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_info" ADD CONSTRAINT "user_info_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_shift" ADD CONSTRAINT "work_shift_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch_office"("branch_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_shift" ADD CONSTRAINT "work_shift_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "xp_log" ADD CONSTRAINT "xp_log_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_type"("activity_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "xp_log" ADD CONSTRAINT "xp_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "roomstatuslog" ADD CONSTRAINT "fk_room" FOREIGN KEY ("room_id") REFERENCES "room"("room_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "roomstatuslog" ADD CONSTRAINT "fk_user" FOREIGN KEY ("changed_by") REFERENCES "user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "room_maintenance" ADD CONSTRAINT "fk_room_maintenance" FOREIGN KEY ("room_id") REFERENCES "room"("room_id") ON DELETE CASCADE ON UPDATE NO ACTION;
