import {reactive} from '@lume/element'
import {Eventful} from '@lume/eventful'
import {DeclarativeBase} from './DeclarativeBase.js'
import {defer} from './utils.js'

/**
 * @class TreeNode - The `TreeNode` class represents objects that are connected
 * to each other in parent-child relationships in a tree structure. A parent
 * can have multiple children, and a child can have only one parent.
 * @extends Eventful
 * @extends DeclarativeBase
 */
@reactive
export class TreeNode extends Eventful(DeclarativeBase) {
	constructor() {
		super()

		// If we're already in the DOM, let's set up the tree state right away.
		// @ts-ignore
		this.parentNode?.add?.(this)
	}

	@reactive __parent: TreeNode | null = null

	__children: TreeNode[] = []

	/**
	 * @readonly
	 * @property {TreeNode | null} parent - The parent of the current TreeNode.
	 * Each node in a tree can have only one parent. `null` if no parent when not connected into a tree.
	 */
	get parent() {
		// In case we're in the DOM when this is called and the parent has
		// the TreeNode API, immediately set up our tree state so that APIs
		// depending on .parent (f.e. before childComposedCallback fires the
		// .add method) don't receive a deceitful null value.
		// @ts-ignore
		if (!this.__parent) this.parentNode?.add?.(this)

		return this.__parent
	}

	/**
	 * @property {TreeNode[]} subnodes - An array of this TreeNode's
	 * children. This returns a clone of the internal child array, so
	 * modifying the cloned array directly does not effect the state of the
	 * TreeNode. Use [TreeNode.add(child)](#addchild) and
	 * [TreeNode.removeNode(child)](#removenode) to modify a TreeNode's
	 * list of children.
	 * This is named `subnodes` to avoid conflict with HTML's `Element.children` property.
	 * @readonly
	 */
	get subnodes() {
		// return a new array, so that the user modifying it doesn't affect
		// this node's actual children.
		return [...this.__children]
	}

	__isConnected = false

	/** @readonly */
	get isConnected(): boolean {
		if (this instanceof Element) {
			// TODO Report this to TypeScript
			// @ts-ignore TS doesn't know that super.isConnected would work here.
			return super.isConnected
		}

		// @ts-ignore
		return this.__isConnected
	}

	/**
	 * @method add - Add a child node to this TreeNode.
	 * @param {TreeNode} childNode - The child node to add.
	 * @returns {this}
	 */
	add(childNode: TreeNode): this {
		// @prod-prune
		if (!(childNode instanceof TreeNode))
			throw new TypeError('TreeNode.add() expects the childNode argument to be a TreeNode instance.')

		if (childNode.__parent === this) return this

		if (childNode.__parent) childNode.__parent.removeNode(childNode)

		childNode.__parent = this

		if (!this.__children) this.__children = []
		this.__children.push(childNode)

		childNode.__isConnected = true

		// TODO avoid deferring. We may need this now that we switched from
		// WithUpdate to reactive props.
		defer(() => {
			childNode.connected()
			this.childConnected(childNode)
		})

		return this
	}

	/**
	 * @method addChildren - Add all the child nodes in the given array to this node.
	 * @param {Array<TreeNode>} nodes - The nodes to add.
	 * @returns {this}
	 */
	addChildren(nodes: TreeNode[]) {
		nodes.forEach(node => this.add(node))
		return this
	}

	/**
	 * @method removeNode - Remove a child node from this node.
	 * @param {TreeNode} childNode - The node to remove.
	 * @returns {this}
	 */
	removeNode(childNode: TreeNode): this {
		if (!(childNode instanceof TreeNode)) {
			throw new Error(`
				TreeNode.remove expects the childNode argument to be an
				instance of TreeNode. There should only be TreeNodes in the
				tree.
			`)
		}

		if (childNode.__parent !== this) throw new ReferenceError('childNode is not a child of this parent.')

		childNode.__parent = null
		this.__children.splice(this.__children.indexOf(childNode), 1)

		childNode.__isConnected = false

		// TODO avoid deferring. We may need this now that we switched from
		// WithUpdate to reactive props.
		defer(() => {
			childNode.disconnected()
			this.childDisconnected(childNode)
		})

		return this
	}

	/**
	 * @method removeChildren - Remove all the child nodes in the given array from this node.
	 * @param {Array<TreeNode>} nodes - The nodes to remove.
	 * @returns {this}
	 */
	removeChildren(nodes: TreeNode[]) {
		for (let i = nodes.length - 1; i >= 0; i -= 1) {
			this.removeNode(nodes[i])
		}
		return this
	}

	/**
	 * @method removeAllChildren - Remove all children.
	 * @returns {this}
	 */
	removeAllChildren() {
		if (!this.__children.length) throw new ReferenceError('This node has no children.')
		this.removeChildren(this.__children)
		return this
	}

	/**
	 * @readonly
	 * @property {number} childCount - How many children this TreeNode has.
	 */
	get childCount() {
		return this.__children.length
	}

	// generic life cycle methods
	connected() {}
	disconnected() {}
	childConnected(_child: TreeNode) {}
	childDisconnected(_child: TreeNode) {}

	/**
	 * @method traverse - Traverse this node and it's tree of subnodes in pre-order.
	 * @param {(n: TreeNode) => void} fn - A callback called on each node,
	 * receiving as first arg the current node in the traversal.
	 */
	traverse(fn: (n: TreeNode) => void) {
		fn(this)

		const children = this.__children
		for (let i = 0, l = children.length; i < l; i++) {
			children[i].traverse(fn)
		}
	}
}
