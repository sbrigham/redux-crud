import {takeEvery} from 'redux-saga';
import {put, call} from 'redux-saga/effects';
import {BEGIN, COMMIT, REVERT} from 'redux-optimist';
import uuid from 'uuid';

export default ({constants, creators, schema, normalizeResponse}) => {
  const resourceUrl = schema._key;
  const onLoadRequest = function *(api, action) {
    const {query, paginate} = action;
    let {path, onSuccess} = action;
    path = path || {};
    let {id, url} = path;

    try {
      let response;
      if (id !== undefined) {
        response = yield call(api.get, `${url || resourceUrl}/${id}`, query);
      } else {
        response = yield call(api.get, url || resourceUrl, query);
      }
      if(onSuccess) yield put(onSuccess(response));

      yield put(creators.loadSuccess({
        response, paginate, path,
        normalize: normalizeResponse(response, schema)
      }));

    } catch (error) {
      console.log(error);
      if (process.env.NODE_ENV === 'development') console.log(error);
      yield put(creators.loadFailure({error, path, paginate}));
    }
  };
  const onAddRequest = function *(api, action) {
    const {path, payload, query, paginate, optimistic} = action;
    let {url} = path;
    let optimisticTransactionId = uuid.v4();

    try {
      if(optimistic) {
        payload.id = optimisticTransactionId;
        yield put(creators.optimisticRequest({
          optimist: {
            type: BEGIN,
            id: optimisticTransactionId
          },
          paginate,
          payload,
          normalize: normalizeResponse(payload, schema)
        }))
      }

      const response = yield call(api.post, url || resourceUrl, payload, query);

      yield put(creators.addSuccess({
        path, query, paginate, response,
        normalize: normalizeResponse(response, schema),
        optimist: optimistic ? {
          type: COMMIT,
          id: optimisticTransactionId
        } : null
      }));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.log(error);
      yield put(creators.addFailure({
        error,
        path,
        paginate,
        optimist: optimistic ? {
          type: REVERT,
          id: optimisticTransactionId
        } : null
      }));
    }
  };
  const onUpdateRequest = function *(api, action) {
    const {path, payload, query, paginate, optimistic, onSuccess} = action;
    let {id, url} = path;

    let optimisticTransactionId = uuid.v4();

    try {
      // if optimistic try to set the response as if it came back from the server
      if(optimistic) {
        yield put(creators.optimisticRequest({
          optimist: {
            type: BEGIN,
            id: optimisticTransactionId
          },
          path, query, paginate,
          normalize: normalizeResponse(payload, schema)
        }))
      }

      const response = yield call(api.put, `${url || resourceUrl}${id ? '/' + id: ''}`, payload, query);

      // NO ERRORS FROM THE SERVER
      yield put(creators.updateSuccess({
        path, query, paginate, response,
        optimist: optimistic ? {
          type: COMMIT,
          id: optimisticTransactionId
        } : null
      }));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.log(error);
      yield put(creators.updateFailure({
        error,
        optimist: optimistic ? {
          type: REVERT,
          id: optimisticTransactionId
        } : null}));
    }
  };
  const onDeleteRequest = function *(api, action) {
    const {path, payload, paginate, optimistic} = action;
    let {url, id} = path;

    let optimisticTransactionId = uuid.v4();
    try {
      if(optimistic) {
        yield put(creators.optimisticRequest({
          optimist: {
            type: BEGIN,
            id: optimisticTransactionId
          },
          removeEntity: {
            id: path.id,
            entityName: resourceUrl
          }
        }))
      }
      yield call(api.delete, url, id);
      yield put(creators.deleteSuccess({
        path, paginate,
        optimist: optimistic ? {
          type: COMMIT,
          id: optimisticTransactionId
        } : null,
        normalize: {result: payload}
      }));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.log(error);
      yield put(creators.deleteFailure({
        error,
        path,
        paginate,
        optimist: optimistic ? {
          type: REVERT,
          id: optimisticTransactionId
        } : null
      }));
    }
  };
  return {
    init: function *(api) {
      if(!api) throw new Error('you must specify an api');
      yield [
        takeEvery(constants.LOAD_REQUEST, onLoadRequest, api),
        takeEvery(constants.ADD_REQUEST, onAddRequest, api),
        takeEvery(constants.UPDATE_REQUEST, onUpdateRequest, api),
        takeEvery(constants.DELETE_REQUEST, onDeleteRequest, api)
      ];
    }
  };
};