export interface Event {
  payload: any
  topic: string
}

export class EventBus {
  private topics: {
    [key: string]: Array<(payload: any) => Promise<any> | void>
  } = {}

  constructor() {}

  publish = <T>(event: Event) => {
    if (!this.topics.hasOwnProperty.call(this.topics, event.topic)) {
      return
    }

    // we make the forEach cb async to prevent blocking the vent loop
    this.topics[event.topic].forEach(async (item) => {
      item(event.payload)
    })
  }

  publishAsync = <T>(event: Event): Promise<void> => {
    if (!this.topics.hasOwnProperty.call(this.topics, event.topic)) {
      return Promise.resolve()
    }

    const promises: Promise<any>[] = []

    this.topics[event.topic].forEach((topicSubscriptionHandler) => {
      const returned = topicSubscriptionHandler(event.payload)
      if (returned && 'then' in returned) promises.push(returned)
    })

    return Promise.all(promises).then(() => undefined)
  }

  publishSync = <T>(event: Event) => {
    if (!this.topics.hasOwnProperty.call(this.topics, event.topic)) {
      return
    }

    this.topics[event.topic].forEach((item) => {
      item(event.payload)
    })
  }

  subscribe = <T>(
    topic: string,
    handler: (payload: T) => Promise<any> | void,
  ) => {
    if (!this.topics.hasOwnProperty.call(this.topics, topic)) {
      this.topics[topic] = []
    }

    const index = this.topics[topic].push(handler) - 1

    return {
      unsubscribe: () => {
        delete this.topics[topic][index]
      },
    }
  }

  unsubscribe = <T>(event: Event, handler: (payload: T) => void) => {
    if (!this.topics.hasOwnProperty.call(this.topics, event.topic)) {
      this.topics[event.topic] = []
    }

    this.topics[event.topic].forEach((topicSubscriptionHandler, index) => {
      if (topicSubscriptionHandler === handler) {
        delete this.topics[event.topic][index]
      }
    })
  }
}
