-- Development-only sample queues. This file is applied by the backend only
-- when SEED_DEVELOPMENT_DATA is enabled; it is not part of schema.sql.
INSERT INTO queues (
  id, name, category, description, status, ticket_prefix, avg_service_minutes
)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'City Barber Shop',
    'Barber',
    'Haircuts and grooming services in the city center.',
    'active',
    'B',
    15
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Corner Table',
    'Restaurant',
    'A neighborhood restaurant with walk-in seating.',
    'active',
    'R',
    20
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'Riverside Clinic',
    'Clinic',
    'General consultations and follow-up visits.',
    'paused',
    'C',
    12
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'Central Bank',
    'Bank',
    'In-person teller and account services.',
    'closed',
    'K',
    10
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    'QuickFix Repair Shop',
    'Repair Shop',
    'Phone, appliance, and small electronics repairs.',
    'active',
    'F',
    25
  )
ON CONFLICT (id) DO NOTHING;
