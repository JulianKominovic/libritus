export function checkSelectionSource(selection = window.getSelection(), sourceSelector: string) {
  if (!selection) return false
  const startingNode = selection?.anchorNode
  if (!startingNode) return false
  const startingNodePath = getParentNodes(startingNode)
  return startingNodePath.some((node) => node instanceof Element && node.matches(sourceSelector))
}

export function getParentNodes(node: Node): Node[] {
  const parents: Node[] = []
  let currentNode: Node | null = node

  while (currentNode) {
    parents.push(currentNode)
    currentNode = currentNode.parentNode
  }

  return parents
}

export function centerScrollX(element: HTMLElement, behavior: ScrollBehavior = 'instant') {
  element.scrollTo({ left: element.scrollWidth / 2 - element.clientWidth / 2, behavior })
}
