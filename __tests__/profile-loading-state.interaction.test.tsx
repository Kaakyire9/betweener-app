import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import ProfileLoadingState from '@/components/profile/ProfileLoadingState';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('@/components/ui/Skeleton', () => ({ ProfileHeroSkeleton: () => null }));

describe('profile loading and recovery screen', () => {
  it('shows loading with a working Back button while the profile is unavailable', async () => {
    const onBack = jest.fn();
    const view = await render(<ProfileLoadingState failed={false} topInset={44} onBack={onBack} onRetry={jest.fn()} />);
    expect(view.getByLabelText('Loading profile')).toBeTruthy();
    expect(view.queryByText('Complete your profile to be seen')).toBeNull();
    expect(view.queryByText('Retry')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('offers retry on failure and returns to loading when retried', async () => {
    const onRetry = jest.fn();
    const props = { topInset: 44, onBack: jest.fn(), onRetry };
    const view = await render(<ProfileLoadingState {...props} failed />);
    expect(view.getByText("Couldn't load profile")).toBeTruthy();
    expect(view.queryByLabelText('Loading profile')).toBeNull();
    await fireEvent.press(view.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await view.rerender(<ProfileLoadingState {...props} failed={false} />);
    expect(view.getByLabelText('Loading profile')).toBeTruthy();
    expect(view.queryByText("Couldn't load profile")).toBeNull();
  });
});
