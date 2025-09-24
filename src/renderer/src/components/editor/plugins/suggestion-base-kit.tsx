import { BaseSuggestionPlugin } from '@platejs/suggestion'

import { SuggestionLeafStatic } from '@renderer/components//ui/suggestion-node-static'

export const BaseSuggestionKit = [BaseSuggestionPlugin.withComponent(SuggestionLeafStatic)]
