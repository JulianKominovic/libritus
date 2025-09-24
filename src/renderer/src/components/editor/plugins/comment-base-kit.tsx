import { BaseCommentPlugin } from '@platejs/comment'

import { CommentLeafStatic } from '@renderer/components//ui/comment-node-static'

export const BaseCommentKit = [BaseCommentPlugin.withComponent(CommentLeafStatic)]
