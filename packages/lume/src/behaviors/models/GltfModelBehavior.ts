import 'element-behaviors'
import {reactive, attribute, autorun, booleanAttribute} from '@lume/element'
import {Scene} from 'three/src/scenes/Scene.js'
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {Box3} from 'three/src/math/Box3.js'
import {Vector3} from 'three/src/math/Vector3.js'
import {disposeObjectTree} from '../../utils/three.js'
import {Events} from '../../core/Events.js'
import {RenderableBehavior} from '../RenderableBehavior.js'

import type {StopFunction} from '@lume/element'
import type {GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js'

export type GltfModelBehaviorAttributes = 'src' | 'dracoDecoder' | 'centerGeometry'

@reactive
export class GltfModelBehavior extends RenderableBehavior {
	/** @property {string | null} src - Path to a `.gltf` or `.glb` file. */
	@attribute src: string | null = ''

	/**
	 * @attribute
	 * @property {string | null} dracoDecoder - Path to the draco decoder that
	 * will unpack decode compressed assets of the GLTF file. This does not need
	 * to be supplied unless you explicitly know you need it.
	 */
	@attribute dracoDecoder: string | null = ''

	/**
	 * @attribute
	 * @property {boolean} centerGeometry - When `true`, all geometry of the
	 * loaded model will be centered at the local origin.
	 */
	@booleanAttribute(false) centerGeometry = false

	dracoLoader?: DRACOLoader
	gltfLoader?: GLTFLoader
	model: GLTF | null = null

	static _observedProperties = [
		'src',
		'dracoPath',
		'centerGeometry',
		...(RenderableBehavior._observedProperties || []),
	]

	// This is incremented any time we need a pending load() to cancel (f.e. on
	// src change, or unloadGL cycle), so that the loader will ignore the
	// result when a version change has happened.
	#version = 0

	#stopFns: StopFunction[] = []

	loadGL() {
		if (!super.loadGL()) return false

		this.dracoLoader = new DRACOLoader()
		this.gltfLoader = new GLTFLoader()
		this.gltfLoader.setDRACOLoader(this.dracoLoader)

		let firstRun = true

		this.#stopFns.push(
			autorun(() => {
				if (this.dracoDecoder) {
					if (!firstRun) this.dracoLoader!.dispose()
					this.dracoLoader!.setDecoderPath(this.dracoDecoder)
				}
			}),
			autorun(() => {
				this.src
				this.dracoDecoder
				this.centerGeometry

				this.#cleanupModel()

				this.#version++
				this.#loadObj()
			}),
		)

		firstRun = false

		return true
	}

	unloadGL() {
		if (!super.unloadGL()) return false

		for (const stop of this.#stopFns) stop()
		this.#stopFns.length = 0

		this.gltfLoader = undefined
		this.dracoLoader?.dispose()
		this.dracoLoader = undefined

		this.#cleanupModel()

		// Increment this in case the loader is still loading, so it will ignore the result.
		this.#version++

		return true
	}

	#cleanupModel() {
		if (this.model) disposeObjectTree(this.model.scene)
		this.model = null
	}

	#loadObj() {
		const {src} = this
		const version = this.#version

		if (!src) return

		// In the following gltfLoader.load() callbacks, if #version doesn't
		// match, it means this.src or this.dracoDecoder changed while
		// a previous model was loading, in which case we ignore that
		// result and wait for the next model to load.

		this.gltfLoader!.load(
			src,
			model => version == this.#version && this.#setModel(model),
			progress => version == this.#version && this.element.emit(Events.PROGRESS, progress),
			error => version == this.#version && this.#onError(error),
		)
	}

	#onError(error: ErrorEvent) {
		const message =
			error?.message ??
			`Failed to load ${this.element.tagName.toLowerCase()} with src "${this.src}" and dracoDecoder "${
				this.dracoDecoder
			}".`
		console.warn(message)
		if (error.error) console.error(error.error)
		this.element.emit(Events.MODEL_ERROR, error.error)
	}

	#setModel(model: GLTF) {
		this.model = model
		model.scene = model.scene || new Scene().add(...model.scenes)

		if (this.centerGeometry) {
			const box = new Box3()
			box.setFromObject(model.scene)
			const center = new Vector3()
			box.getCenter(center)
			model.scene.position.copy(center.negate())
		}

		this.element.three.add(model.scene)
		this.element.emit(Events.MODEL_LOAD, {format: 'gltf', model})
		this.element.needsUpdate()
	}
}

if (!elementBehaviors.has('gltf-model')) elementBehaviors.define('gltf-model', GltfModelBehavior)
