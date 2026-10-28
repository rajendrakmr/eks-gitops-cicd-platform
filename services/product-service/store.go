package main

import (
	"context"
	"errors"
	"regexp"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Product struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name        string             `bson:"name" json:"name"`
	Description string             `bson:"description" json:"description"`
	Price       float64            `bson:"price" json:"price"`
	Category    string             `bson:"category" json:"category"`
	Image       string             `bson:"image" json:"image"`
	Stock       int                `bson:"stock" json:"stock"`
	Rating      float64            `bson:"rating" json:"rating"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
}

type ListQuery struct {
	Search   string
	Category string
	Sort     string
	Page     int
	Limit    int
}

type ListResult struct {
	Items []Product `json:"items"`
	Total int64     `json:"total"`
	Page  int       `json:"page"`
	Limit int       `json:"limit"`
	Pages int       `json:"pages"`
}

var ErrInsufficientStock = errors.New("insufficient stock or product not found")

type Store struct{ col *mongo.Collection }

func NewStore(col *mongo.Collection) *Store { return &Store{col: col} }

func (s *Store) EnsureIndexes(ctx context.Context) error {
	_, err := s.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "category", Value: 1}, {Key: "price", Value: 1}}},
		{Keys: bson.D{{Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "rating", Value: -1}}},
		{Keys: bson.D{{Key: "name", Value: 1}}},
	})
	return err
}

func normalizeQuery(q ListQuery) ListQuery {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 {
		q.Limit = 12
	}
	if q.Limit > 100 {
		q.Limit = 100
	}
	switch q.Sort {
	case "price_asc", "price_desc", "rating", "newest":
	default:
		q.Sort = "newest"
	}
	return q
}

func (s *Store) List(ctx context.Context, q ListQuery) (*ListResult, error) {
	q = normalizeQuery(q)
	filter := bson.M{}
	if q.Search != "" {
		filter["name"] = bson.M{"$regex": regexp.QuoteMeta(q.Search), "$options": "i"}
	}
	if q.Category != "" {
		filter["category"] = q.Category
	}

	sort := bson.D{{Key: "createdAt", Value: -1}}
	switch q.Sort {
	case "price_asc":
		sort = bson.D{{Key: "price", Value: 1}}
	case "price_desc":
		sort = bson.D{{Key: "price", Value: -1}}
	case "rating":
		sort = bson.D{{Key: "rating", Value: -1}}
	}

	total, err := s.col.CountDocuments(ctx, filter)
	if err != nil {
		return nil, err
	}
	opts := options.Find().SetSort(sort).SetSkip(int64((q.Page - 1) * q.Limit)).SetLimit(int64(q.Limit))
	cur, err := s.col.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	items := []Product{}
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	pages := int((total + int64(q.Limit) - 1) / int64(q.Limit))
	return &ListResult{Items: items, Total: total, Page: q.Page, Limit: q.Limit, Pages: pages}, nil
}

func (s *Store) Get(ctx context.Context, id primitive.ObjectID) (*Product, error) {
	var p Product
	if err := s.col.FindOne(ctx, bson.M{"_id": id}).Decode(&p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Store) Create(ctx context.Context, p *Product) error {
	p.CreatedAt = time.Now().UTC()
	res, err := s.col.InsertOne(ctx, p)
	if err != nil {
		return err
	}
	p.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (s *Store) Update(ctx context.Context, id primitive.ObjectID, p *Product) (*Product, error) {
	update := bson.M{"$set": bson.M{
		"name": p.Name, "description": p.Description, "price": p.Price,
		"category": p.Category, "image": p.Image, "stock": p.Stock,
	}}
	var out Product
	err := s.col.FindOneAndUpdate(ctx, bson.M{"_id": id}, update,
		options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *Store) Delete(ctx context.Context, id primitive.ObjectID) (bool, error) {
	res, err := s.col.DeleteOne(ctx, bson.M{"_id": id})
	return res != nil && res.DeletedCount > 0, err
}

func (s *Store) Categories(ctx context.Context) ([]string, error) {
	vals, err := s.col.Distinct(ctx, "category", bson.M{})
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(vals))
	for _, v := range vals {
		if str, ok := v.(string); ok {
			out = append(out, str)
		}
	}
	return out, nil
}

func (s *Store) Count(ctx context.Context) (int64, error) {
	return s.col.CountDocuments(ctx, bson.M{})
}

func (s *Store) InsertMany(ctx context.Context, products []Product) error {
	docs := make([]any, len(products))
	for i := range products {
		products[i].CreatedAt = time.Now().UTC().Add(-time.Duration(i) * time.Minute)
		docs[i] = products[i]
	}
	_, err := s.col.InsertMany(ctx, docs)
	return err
}

// Reserve atomically decrements stock only when enough is available, so two
// concurrent checkouts can never oversell an item.
func (s *Store) Reserve(ctx context.Context, id primitive.ObjectID, qty int) (*Product, error) {
	var p Product
	err := s.col.FindOneAndUpdate(ctx,
		bson.M{"_id": id, "stock": bson.M{"$gte": qty}},
		bson.M{"$inc": bson.M{"stock": -qty}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&p)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrInsufficientStock
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Store) Release(ctx context.Context, id primitive.ObjectID, qty int) error {
	_, err := s.col.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$inc": bson.M{"stock": qty}})
	return err
}
