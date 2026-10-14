from app.db import SessionLocal
from app.models import Product

PRODUCTS = [
    ("Café de Nariño", "Café de altura, tostado en pequeños lotes en el sur de Colombia.", "Despensa", 28000, "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=900&q=85", 24),
    ("Fresas de La Cocha", "Fresas frescas, dulces y cosechadas cerca de la laguna.", "Frutas", 9500, "https://images.unsplash.com/photo-1464965911861-746a04b4bca6?auto=format&fit=crop&w=900&q=85", 18),
    ("Quesillo artesanal", "Quesillo suave de leche fresca producido en Nariño.", "Lácteos", 14000, "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=900&q=85", 12),
    ("Mora de Castilla", "Moras maduras para jugos, postres o disfrutar al natural.", "Frutas", 8000, "https://images.unsplash.com/photo-1498557850523-fd3d118b962e?auto=format&fit=crop&w=900&q=85", 20),
    ("Papa pastusa", "Papa de altura, ideal para sopas y recetas de la región.", "Huerta", 6500, "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=900&q=85", 30),
    ("Miel de montaña", "Miel natural de apicultores locales, cosecha de temporada.", "Despensa", 22000, "https://images.unsplash.com/photo-1587049352851-8d4e89133924?auto=format&fit=crop&w=900&q=85", 10),
    ("Uchuvas frescas", "Uchuvas seleccionadas en su punto, brillantes y ácidas.", "Frutas", 11000, "https://images.unsplash.com/photo-1596591606975-97ee5cef3a1e?auto=format&fit=crop&w=900&q=85", 16),
    ("Panela orgánica", "Panela de caña cultivada en fincas familiares del sur.", "Despensa", 12000, "https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=900&q=85", 14),
]


def seed_products() -> int:
    with SessionLocal.begin() as session:
        if session.query(Product.id).first():
            return 0
        for name, description, category, price, image, stock in PRODUCTS:
            session.add(Product(
                name=name,
                description=description,
                category=category,
                price_cop=price,
                image_url=image,
                stock=stock,
                active=True,
            ))
        return len(PRODUCTS)


if __name__ == "__main__":
    print(f"Productos de demostración insertados: {seed_products()}")
