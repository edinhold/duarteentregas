import { Category, Restaurant, Product } from "@/types";

export const categories: Category[] = [
  { id: "1", name: "Lanches", icon: "🍔", image: "/placeholder.svg" },
  { id: "2", name: "Pizza", icon: "🍕", image: "/placeholder.svg" },
  { id: "3", name: "Japonesa", icon: "🍣", image: "/placeholder.svg" },
  { id: "4", name: "Brasileira", icon: "🍛", image: "/placeholder.svg" },
  { id: "5", name: "Sobremesas", icon: "🍰", image: "/placeholder.svg" },
  { id: "6", name: "Bebidas", icon: "🥤", image: "/placeholder.svg" },
  { id: "7", name: "Açaí", icon: "🫐", image: "/placeholder.svg" },
  { id: "8", name: "Saudável", icon: "🥗", image: "/placeholder.svg" },
];

export const restaurants: Restaurant[] = [
  {
    id: "1", name: "Burger King", image: "/placeholder.svg", logo: "/placeholder.svg",
    category: "Lanches", rating: 4.5, deliveryTime: "30-40 min", deliveryFee: 5.99,
    minOrder: 20, distance: "1.2 km", isOpen: true, isFeatured: true,
  },
  {
    id: "2", name: "Pizza Hut", image: "/placeholder.svg", logo: "/placeholder.svg",
    category: "Pizza", rating: 4.3, deliveryTime: "40-55 min", deliveryFee: 7.99,
    minOrder: 30, distance: "2.5 km", isOpen: true, isFeatured: true,
  },
  {
    id: "3", name: "Sushi Now", image: "/placeholder.svg", logo: "/placeholder.svg",
    category: "Japonesa", rating: 4.8, deliveryTime: "45-60 min", deliveryFee: 9.99,
    minOrder: 40, distance: "3.1 km", isOpen: true, isFeatured: false,
  },
  {
    id: "4", name: "Cantina da Vovó", image: "/placeholder.svg", logo: "/placeholder.svg",
    category: "Brasileira", rating: 4.6, deliveryTime: "35-50 min", deliveryFee: 4.99,
    minOrder: 25, distance: "0.8 km", isOpen: true, isFeatured: true,
  },
  {
    id: "5", name: "Doce Encanto", image: "/placeholder.svg", logo: "/placeholder.svg",
    category: "Sobremesas", rating: 4.7, deliveryTime: "25-35 min", deliveryFee: 3.99,
    minOrder: 15, distance: "1.0 km", isOpen: false,
  },
  {
    id: "6", name: "Açaí Mania", image: "/placeholder.svg", logo: "/placeholder.svg",
    category: "Açaí", rating: 4.4, deliveryTime: "20-30 min", deliveryFee: 2.99,
    minOrder: 18, distance: "0.5 km", isOpen: true,
  },
];

export const products: Product[] = [
  { id: "p1", restaurantId: "1", name: "Whopper", description: "Hambúrguer grelhado com salada, tomate, cebola, picles e maionese", price: 29.90, image: "/placeholder.svg", category: "Burgers" },
  { id: "p2", restaurantId: "1", name: "Whopper Duplo", description: "Dois hambúrgueres grelhados com queijo, salada e molho especial", price: 35.90, image: "/placeholder.svg", category: "Burgers" },
  { id: "p3", restaurantId: "1", name: "Chicken Crispy", description: "Frango empanado crocante com alface e maionese", price: 24.90, image: "/placeholder.svg", category: "Burgers" },
  { id: "p4", restaurantId: "1", name: "Onion Rings", description: "Anéis de cebola empanados e fritos", price: 14.90, image: "/placeholder.svg", category: "Acompanhamentos" },
  { id: "p5", restaurantId: "1", name: "Batata Frita G", description: "Porção grande de batatas fritas crocantes", price: 12.90, image: "/placeholder.svg", category: "Acompanhamentos" },
  { id: "p6", restaurantId: "1", name: "Milk Shake Chocolate", description: "Milk shake cremoso sabor chocolate", price: 16.90, image: "/placeholder.svg", category: "Bebidas" },
  { id: "p7", restaurantId: "2", name: "Pizza Margherita", description: "Molho de tomate, mussarela e manjericão fresco", price: 42.90, image: "/placeholder.svg", category: "Pizzas" },
  { id: "p8", restaurantId: "2", name: "Pizza Pepperoni", description: "Molho de tomate, mussarela e pepperoni", price: 49.90, image: "/placeholder.svg", category: "Pizzas" },
  { id: "p9", restaurantId: "3", name: "Combo Sushi 20pçs", description: "10 niguiris e 10 uramakis variados", price: 69.90, image: "/placeholder.svg", category: "Combos" },
  { id: "p10", restaurantId: "4", name: "Feijoada Completa", description: "Feijoada com arroz, couve, farofa e laranja", price: 34.90, image: "/placeholder.svg", category: "Pratos" },
];
