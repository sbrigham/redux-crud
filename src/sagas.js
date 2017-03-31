import { select, put, call, takeEvery } from 'redux-saga/effects';
import { BEGIN, COMMIT, REVERT } from 'redux-optimistic-ui';
import uuid from 'uuid';

/*
New API

getRequest
listRequest

getRequest({
  query: {
    url: 'awesome',
    params: {

    },
    payload: {

    }
  },
  group: {
    by: 'school',
    by: {
      key: 'school'
      index: '1'
    },
    reset: true
  }
})
*/


export default ({
  constants,
  creators,
  fetchConfigSelector,
  schema,
  handleResponse,
  onLoadRequest,
  onServerError,
}) => {
  const resourceUrl = schema._key;
  const getRequest = function* (api, action) {
    const { query, paginate = {}, onError, deferLoadRequest = false } = action;
    if (deferLoadRequest) return;
    const { path = {}, onSuccess } = action;
    const { id, url } = path;

    let fetchConfig = {};
    if (fetchConfigSelector) fetchConfig = yield select(fetchConfigSelector);

    try {
      let response;
      if (id !== undefined) {
        const promise = new Promise((resolve) => {
          resolve(api.get(`${url || resourceUrl}/${id}`, query, fetchConfig));
        });
        onLoadRequest(promise);
        response = yield promise;
      } else {
        const promise = new Promise((resolve) => {
          resolve(api.get(`${url || resourceUrl}`, query, fetchConfig));
        });
        onLoadRequest(promise);
        response = yield promise;
      }
      if (onSuccess) yield put(onSuccess(response));

      const { normalize, totalItems = null } = handleResponse(response, schema);

      yield put(creators.getSuccess({
        response,
        paginate,
        path,
        normalize,
        meta: {
          totalItems,
        },
      }));
    } catch (error) {
      if (onError) onError(error);
      if (process.env.NODE_ENV === 'development') console.log(error);
      onServerError(error);
      yield put(creators.getFailure({ error, path, paginate }));
    }
  };
  const onCreateRequest = function* (api, action) {
    const { path, payload, query, paginate = {}, optimistic = true, onSuccess, onError } = action;
    const { url } = path;
    const optimisticTransactionId = uuid.v4();
    let fetchConfig = {};
    if (fetchConfigSelector) fetchConfig = yield select(fetchConfigSelector);

    try {
      if (optimistic) {
        const { normalize: optimisticNormalize } = handleResponse(payload, schema);

        payload.id = optimisticTransactionId;
        yield put(creators.optimisticRequest({
          meta: {
            optimisticTransactionId,
            optimistic: {
              type: BEGIN,
              id: optimisticTransactionId,
            },
          },
          paginate,
          payload,
          normalize: optimisticNormalize,
        }));
      }

      const response = yield call(api.post, url || resourceUrl, payload, query, fetchConfig);

      const { normalize } = handleResponse(response, schema);

      yield put(creators.createSuccess({
        path,
        query,
        paginate,
        response,
        normalize,
        meta: {
          optimisticTransactionId,
          optimistic: optimistic ? {
            type: COMMIT,
            id: optimisticTransactionId,
          } : null,
        },
      }));
      if (onSuccess) onSuccess(response);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.log(error);
      onServerError(error);
      if (onError) onError(error);
      yield put(creators.createFailure({
        error,
        path,
        paginate,
        meta: {
          optimisticTransactionId,
          optimistic: optimistic ? {
            type: REVERT,
            id: optimisticTransactionId,
          } : null,
        },
      }));
    }
  };
  const onUpdateRequest = function* (api, action) {
    const { path, payload, query, paginate = {}, optimistic = true, onSuccess, onError } = action;

    if (path === undefined && payload.id === undefined) throw new Error('You need to specify an id for this update request');

    const id = path !== undefined ? path.id : payload.id;
    const url = path !== undefined ? path.url : resourceUrl;
    const optimisticTransactionId = uuid.v4();
    let fetchConfig = {};
    if (fetchConfigSelector) fetchConfig = yield select(fetchConfigSelector);

    try {
      // if optimistic try to set the response as if it came back from the server
      if (optimistic) {
        const { normalize: optimisticNormalize } = handleResponse(payload, schema);
        yield put(creators.optimisticRequest({
          meta: {
            optimisticTransactionId,
            optimistic: {
              type: BEGIN,
              id: optimisticTransactionId,
            },
          },
          path,
          query,
          paginate,
          payload,
          normalize: optimisticNormalize,
        }));
      }

      const response = yield call(api.put, `${url}${id ? `/${id}` : ''}`, payload, query, fetchConfig);

      // NO ERRORS FROM THE SERVER
      yield put(creators.updateSuccess({
        path,
        query,
        paginate,
        response,
        meta: {
          optimisticTransactionId,
          optimistic: optimistic ? {
            type: COMMIT,
            id: optimisticTransactionId,
          } : null,
        },
      }));
      if (onSuccess) onSuccess(response);
    } catch (error) {
      onServerError(error);
      if (onError) onError(error);
      if (process.env.NODE_ENV === 'development') console.log(error);
      yield put(creators.updateFailure({
        error,
        meta: {
          optimisticTransactionId,
          optimistic: optimistic ? {
            type: REVERT,
            id: optimisticTransactionId,
          } : null,
        },
      }));
    }
  };
  const onDeleteRequest = function* (api, action) {
    const { path, payload = {}, query = {}, paginate = {}, optimistic = true, onSuccess, onError } = action;
    const { url, id } = path;
    let fetchConfig = {};
    if (fetchConfigSelector) fetchConfig = yield select(fetchConfigSelector);

    const optimisticTransactionId = uuid.v4();
    try {
      if (optimistic) {
        yield put(creators.optimisticRequest({
          meta: {
            optimisticTransactionId,
            optimistic: {
              type: BEGIN,
              id: optimisticTransactionId,
            },
          },
          removeEntity: {
            id,
            entityName: resourceUrl,
          },
        }));
      }
      const response = yield call(api.delete, url, payload, query, fetchConfig);
      yield put(creators.deleteSuccess({
        path,
        paginate,
        meta: {
          optimisticTransactionId,
          optimistic: optimistic ? {
            type: COMMIT,
            id: optimisticTransactionId,
          } : null,
        },
        normalize: { result: payload },
      }));
      if (onSuccess) onSuccess(response);
    } catch (error) {
      onServerError(error);
      if (onError) onError(error);
      if (process.env.NODE_ENV === 'development') console.log(error);
      yield put(creators.deleteFailure({
        error,
        path,
        paginate,
        meta: {
          optimisticTransactionId,
          optimistic: optimistic ? {
            type: REVERT,
            id: optimisticTransactionId,
          } : null,
        },
      }));
    }
  };
  return {
    init: function (api) {
      return function* () {
        if (!api) throw new Error('you must specify an api');
        yield [
          takeEvery(constants.GET_REQUEST, getRequest, api),
          takeEvery(constants.LIST_REQUEST, getRequest, api),

          takeEvery(constants.CREATE_REQUEST, onCreateRequest, api),
          takeEvery(constants.UPDATE_REQUEST, onUpdateRequest, api),
          takeEvery(constants.DELETE_REQUEST, onDeleteRequest, api),
        ];
      };
    },
  };
};
