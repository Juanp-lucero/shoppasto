"""Create product, reservation, and order tables."""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=140), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("price_cop", sa.Integer(), nullable=False),
        sa.Column("image_url", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("stock", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("price_cop >= 0", name="ck_products_price_nonnegative"),
        sa.CheckConstraint("stock >= 0", name="ck_products_stock_nonnegative"),
    )
    op.create_index("ix_products_category_active", "products", ["category", "active"])
    op.create_table(
        "reservations",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('reserved', 'released')", name="ck_reservations_status"),
    )
    op.create_table(
        "reservation_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reservation_id", sa.String(length=36), sa.ForeignKey("reservations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_reservation_items_quantity_positive"),
        sa.UniqueConstraint("reservation_id", "product_id", name="uq_reservation_product"),
    )
    op.create_index("ix_reservation_items_reservation", "reservation_items", ["reservation_id"])
    op.create_table(
        "orders",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("idempotency_key", sa.String(length=120), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("customer_name", sa.String(length=120), nullable=False),
        sa.Column("customer_email", sa.String(length=254), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("total_cop", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('pending', 'confirmed', 'cancelled')", name="ck_orders_status"),
        sa.CheckConstraint("total_cop >= 0", name="ck_orders_total_nonnegative"),
        sa.UniqueConstraint("idempotency_key", name="uq_orders_idempotency_key"),
    )
    op.create_index("ix_orders_customer_email_created", "orders", ["customer_email", "created_at"])
    op.create_table(
        "order_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.String(length=36), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.String(length=140), nullable=False),
        sa.Column("unit_price_cop", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("line_total_cop", sa.Integer(), nullable=False),
        sa.CheckConstraint("unit_price_cop >= 0", name="ck_order_items_price_nonnegative"),
        sa.CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
        sa.CheckConstraint("line_total_cop >= 0", name="ck_order_items_total_nonnegative"),
    )
    op.create_index("ix_order_items_order", "order_items", ["order_id"])


def downgrade() -> None:
    op.drop_index("ix_order_items_order", table_name="order_items")
    op.drop_table("order_items")
    op.drop_index("ix_orders_customer_email_created", table_name="orders")
    op.drop_table("orders")
    op.drop_index("ix_reservation_items_reservation", table_name="reservation_items")
    op.drop_table("reservation_items")
    op.drop_table("reservations")
    op.drop_index("ix_products_category_active", table_name="products")
    op.drop_table("products")
