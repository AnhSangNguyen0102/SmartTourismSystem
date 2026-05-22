import { render, screen } from '@testing-library/react';
import App from './App';

test('renders TravelSafe heading', () => {
  render(<App />);
  const headingElement = screen.getByText(/TravelSafe/i);
  expect(headingElement).toBeInTheDocument();
});
