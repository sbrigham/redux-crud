import { uniq } from 'lodash/fp';

export const entitiesReducer = (state = {}, action) => {
  const { payload, normalize, meta, removeEntity } = action;
  let entities;
  if (removeEntity && removeEntity.entityName in state && removeEntity.id in state[removeEntity.entityName]) {
    const newEntities = { ...state[removeEntity.entityName] };
    delete newEntities[removeEntity.id];
    const newState = {
      ...state,
    };
    newState[removeEntity.entityName] = newEntities;
    return newState;
  }

  if (payload && 'entities' in payload) entities = payload.entities;
  if (normalize && 'entities' in normalize) entities = normalize.entities;

  if (entities) {
    // merge entities
    const ent = Object.keys(entities).reduce((acc, key) => {
      // deep merge keys in entities
      const n = Object.keys(entities[key]).reduce((a, k) => {
        const existingEntity = key in state && k in state[key] ? state[key][k] : {};
        const newEntity = entities[key][k];
        a[k] = { ...existingEntity, ...newEntity };
        return a;
      }, {});
      const existingEntities = state[key];
      if (meta && meta.optimisticTransactionId && normalize.result && normalize.result != meta.optimisticTransactionId) {
        delete existingEntities[meta.optimisticTransactionId];
      }

      acc[key] = { ...existingEntities, ...n };
      return acc;
    }, {});
    // merge state
    return { ...state, ...ent };
  }
  return state;
};

export const defaultState = {
  lastQuery: null,
  isLoading: false,
  ids: [],
  totalItems: 0,
  hasError: false,
};

export const groupByKey = (key) => {
  return `by${key.charAt(0).toUpperCase() + key.slice(1)}`;
};

export const paginateReducer = (reduxConst, responseKeys) => {
  const reducer = (state = defaultState, action) => {
    const { payload, normalize, response, paginate, removeEntity , meta} = action;
    let result = [], totalItems = state.totalItems || 0, direction;

    if (normalize && 'result' in normalize) result = normalize.result;

    if (response && responseKeys && responseKeys.totalItems) totalItems = response[responseKeys.totalItems];

    if (payload && 'direction' in payload) direction = payload.direction;
    if (paginate && 'direction' in paginate) direction = paginate.direction;

    switch (action.type) {
      case reduxConst.LOAD_REQUEST:
      case reduxConst.ADD_REQUEST:
      case reduxConst.UPDATE_REQUEST:
      case reduxConst.DELETE_REQUEST:
      {
        let override = {
          isLoading: true,
          lastQuery: action.query,
          totalItems
        };
        return Object.assign({}, state, override);
      }
      case reduxConst.LOAD_SUCCESS:
      {
        const newIDs = result !== null && Array.isArray(result) ? result : [result];
        const isNext = direction === 'next';

        const reset = 'reset' in paginate ? paginate.reset : false;
        let existingIds = [...state.ids];
        if(reset) existingIds = [];

        let ids = isNext ? [...newIDs, ...existingIds] : [...existingIds, ...newIDs];
        return Object.assign({}, state, {
          isLoading: false,
          ids: uniq(ids),
          totalItems: (totalItems ? totalItems : ids.length)
        });
      }
      case reduxConst.OPTIMISTIC_REQUEST: {
        const reset = 'reset' in paginate ? paginate.reset : false;
        let existingIds = [...state.ids];
        if(reset) existingIds = [];
        let ids = [result, ...existingIds];
        if(removeEntity && ids.indexOf(removeEntity.id) != -1) {
          ids.splice(ids.indexOf(removeEntity.id), 1);
        }
        return Object.assign({}, state, {
          isLoading: false,
          ids,
          totalItems: (totalItems ? totalItems : ids.length)
        });
      }
      case reduxConst.ADD_SUCCESS: {
        const reset = 'reset' in paginate ? paginate.reset : false;
        let existingIds = [...state.ids];
        let newIds = [];
        if(reset) existingIds = [];

        // Swap out the temp "optimistic id" for the actual id
        if(meta && meta.optimisticTransactionId && existingIds.indexOf(meta.optimisticTransactionId) != -1) {
          const tempIndex = existingIds.indexOf(meta.optimisticTransactionId);
          existingIds[tempIndex] = result;
        } else {
          existingIds = [result, ...existingIds];
        }

        newIds = [...existingIds];

        return Object.assign({}, state, {
          isLoading: false,
          ids: newIds,
          totalItems: (totalItems ? totalItems : newIds.length)
        });
      }
      case reduxConst.DELETE_SUCCESS:
      {
        const ids = state.ids.filter(id => id !== result);
        return Object.assign({}, state, {
          isLoading: false,
          ids,
          totalItems: state.totalItems ? state.totalItems - 1 : 0
        });
      }
      case reduxConst.LOAD_FAILURE:
      case reduxConst.ADD_FAILURE:
      case reduxConst.UPDATE_SUCCESS:
      case reduxConst.UPDATE_FAILURE:
      case reduxConst.DELETE_FAILURE:
        return Object.assign({}, state, {
          isLoading: false,
          hasError: true
        });
      default:
        return state;
    }
  };

  return (state = {groupings: null}, action) => {
    const {paginate = false} = action;
    if(paginate === false) return state;

    switch (action.type) {
      case reduxConst.LOAD_REQUEST:
      case reduxConst.LOAD_SUCCESS:
      case reduxConst.LOAD_FAILURE:
      case reduxConst.ADD_REQUEST:
      case reduxConst.ADD_SUCCESS:
      case reduxConst.ADD_FAILURE:
      case reduxConst.UPDATE_REQUEST:
      case reduxConst.UPDATE_SUCCESS:
      case reduxConst.UPDATE_FAILURE:
      case reduxConst.DELETE_REQUEST:
      case reduxConst.DELETE_SUCCESS:
      case reduxConst.DELETE_FAILURE:
      case reduxConst.OPTIMISTIC_REQUEST:
        const {groupBy} = paginate;
        if(groupBy) {
          if(paginate && !('groupBy' in paginate)) throw new Error(`A groupBy must be specified in the form groupBy: { index: number, key: string}. For action type: ${action.type} `);
          if(paginate.groupBy && !('key' in paginate.groupBy))throw new Error(`A key as a string must be specified in your groupBy. For action type: ${action.type}`);
          if(paginate.groupBy && !('index' in paginate.groupBy))throw new Error(`An index as an int/string must be specified in your groupBy. For action type: ${action.type}`);

          const {key, index} = groupBy;
          const byKey = groupByKey(key);

          const existingGroupings = state.groupings ? state.groupings[byKey] : {};
          const existingValues = state.groupings ? state['groupings'][byKey][index] : {ids: []};

          return {
            ...state,
            groupings: {
              ...state.groupings,
              [byKey]: {
                ...existingGroupings,
                [index]: {...existingValues, ...reducer(existingValues, action)}
              }
            }
          };
        } else {
          const {groupings, ...everythingElse} = state;
          everythingElse = {ids: [], ...everythingElse};
          return {
            groupings,
            ...reducer(everythingElse, action)
          }
        }
      default:
        return state;
    }
  };
};
