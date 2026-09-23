const React = require('react');
const { View } = require('react-native');

const request = (requestType, options = {}) => ({ requestType, ...options });

module.exports = {
  GiphyContent: {
    animate: (options) => request('animate', options),
    search: (options) => request('search', options),
    trendingGifs: (options) => request('trending', options),
  },
  GiphyGridView: ({ children, ...props }) => React.createElement(View, props, children),
  GiphyMediaType: { Gif: 'gif', Sticker: 'sticker', Text: 'text', Video: 'video' },
  GiphyRating: { G: 'g', PG: 'pg', PG13: 'pg-13', R: 'r', Unrated: 'unrated', Y: 'y' },
  GiphyRendition: { FixedWidth: 'fixed_width' },
  GiphySDK: { configure: () => {} },
  GiphyThemePreset: { Automatic: 'automatic', Dark: 'dark', Light: 'light' },
};
