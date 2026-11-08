import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';

const waitForPlayerReady = async (player: VideoPlayer, timeoutMs = 15_000) => {
  if (player.status === 'readyToPlay') return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      subscription.remove();
      reject(new Error('circle_media_poster_timeout'));
    }, timeoutMs);
    const subscription = (player as any).addListener('statusChange', ({ status, error }: { status: string; error?: { message?: string } | null }) => {
      if (status === 'readyToPlay') {
        clearTimeout(timeout);
        subscription.remove();
        resolve();
      } else if (status === 'error') {
        clearTimeout(timeout);
        subscription.remove();
        reject(new Error(error?.message || 'circle_media_poster_failed'));
      }
    });
  });
};

export async function generateCirclePulseVideoPoster(videoUri: string) {
  const player = createVideoPlayer(null);
  try {
    const ready = waitForPlayerReady(player);
    await player.replaceAsync({ uri: videoUri });
    await ready;
    const [thumbnail] = await player.generateThumbnailsAsync(0.5, {
      maxWidth: 1280,
      maxHeight: 1280,
    });
    if (!thumbnail) throw new Error('circle_media_poster_failed');

    const context = ImageManipulator.manipulate(thumbnail as any);
    try {
      const image = await context.renderAsync();
      try {
        return await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      } finally {
        (image as any).release?.();
      }
    } finally {
      (context as any).release?.();
      (thumbnail as any).release?.();
    }
  } finally {
    (player as any).release?.();
  }
}
