package main

import (
	"context"
	"log"
	"strings"
)

func img(slug string) string {
	return "https://picsum.photos/seed/" + strings.ReplaceAll(slug, " ", "-") + "/640/480"
}

func sampleProducts() []Product {
	return []Product{
		{Name: "Aurora Wireless Headphones", Description: "Active noise cancelling over-ear headphones with 40 hour battery life and multipoint Bluetooth.", Price: 129.99, Category: "Electronics", Image: img("aurora headphones"), Stock: 60, Rating: 4.7},
		{Name: "Nimbus 14\" Ultrabook", Description: "Lightweight 14 inch laptop with a 2.8K display, 16GB RAM and all day battery.", Price: 949.00, Category: "Electronics", Image: img("nimbus ultrabook"), Stock: 25, Rating: 4.6},
		{Name: "Pulse Smartwatch", Description: "Fitness tracking, GPS and sleep coaching in a water resistant aluminium case.", Price: 199.50, Category: "Electronics", Image: img("pulse smartwatch"), Stock: 80, Rating: 4.4},
		{Name: "Everyday Canvas Backpack", Description: "Water resistant 24L backpack with padded laptop sleeve and hidden passport pocket.", Price: 59.00, Category: "Fashion", Image: img("canvas backpack"), Stock: 120, Rating: 4.5},
		{Name: "Trailrunner Sneakers", Description: "Breathable, cushioned sneakers built for daily miles and weekend trails.", Price: 84.95, Category: "Fashion", Image: img("trailrunner sneakers"), Stock: 90, Rating: 4.3},
		{Name: "Merino Crew Sweater", Description: "Soft, temperature regulating merino wool sweater in a classic fit.", Price: 74.00, Category: "Fashion", Image: img("merino sweater"), Stock: 70, Rating: 4.8},
		{Name: "Ember Pour-Over Coffee Set", Description: "Borosilicate glass dripper, server and reusable filter for café quality coffee at home.", Price: 38.50, Category: "Home", Image: img("pour over coffee"), Stock: 150, Rating: 4.6},
		{Name: "Halo Desk Lamp", Description: "Dimmable LED desk lamp with wireless charging base and adjustable colour temperature.", Price: 45.00, Category: "Home", Image: img("halo desk lamp"), Stock: 110, Rating: 4.2},
		{Name: "Cloud Linen Bedding Set", Description: "Stonewashed European linen duvet cover and two pillowcases.", Price: 139.00, Category: "Home", Image: img("linen bedding"), Stock: 40, Rating: 4.9},
		{Name: "Designing Data-Intensive Applications", Description: "The big ideas behind reliable, scalable and maintainable systems.", Price: 42.99, Category: "Books", Image: img("data intensive book"), Stock: 200, Rating: 4.9},
		{Name: "The Pragmatic Programmer", Description: "Your journey to mastery, 20th anniversary edition.", Price: 39.99, Category: "Books", Image: img("pragmatic programmer"), Stock: 180, Rating: 4.8},
		{Name: "Site Reliability Engineering", Description: "How Google runs production systems.", Price: 35.00, Category: "Books", Image: img("sre book"), Stock: 140, Rating: 4.7},
		{Name: "Flow Yoga Mat", Description: "6mm non-slip natural rubber mat with alignment markings.", Price: 52.00, Category: "Sports", Image: img("yoga mat"), Stock: 95, Rating: 4.5},
		{Name: "Summit Insulated Bottle", Description: "750ml double wall stainless steel bottle, keeps drinks cold 24 hours or hot 12.", Price: 28.00, Category: "Sports", Image: img("insulated bottle"), Stock: 220, Rating: 4.6},
		{Name: "Adjustable Dumbbell Pair", Description: "Space saving dumbbells adjustable from 2 to 24 kg each.", Price: 279.00, Category: "Sports", Image: img("adjustable dumbbells"), Stock: 30, Rating: 4.7},
	}
}

func seedIfEmpty(ctx context.Context, s *Store) {
	n, err := s.Count(ctx)
	if err != nil {
		log.Printf("seed: count failed: %v", err)
		return
	}
	if n > 0 {
		return
	}
	if err := s.InsertMany(ctx, sampleProducts()); err != nil {
		log.Printf("seed: insert failed: %v", err)
		return
	}
	log.Printf("seeded %d sample products", len(sampleProducts()))
}
