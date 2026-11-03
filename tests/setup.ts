// tests/setup.ts
import dotenv from 'dotenv';

// Load environment variables for testing
dotenv.config();

// Set test database URL
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kuppi-test';

// Suppress console logs during tests if needed
beforeAll(() => {
  // Suppress console.log in tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});
