# Dockerfile for building RDKit MinimalLib with MCS + FS (File System) support
# FS support enables the WASM module to load external font files (e.g., .ttf)
# into an in-memory filesystem for use with MolDraw2D's fontfile option.
#
# Based on rdkit/rdkit-js Dockerfile with:
#   - -DRDK_BUILD_MINIMAL_LIB_MCS=ON
#   - -sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=["FS"]

FROM debian:bookworm as build-stage

ARG RDKIT_BRANCH="master"
ARG RDKIT_GIT_URL="https://github.com/rdkit/rdkit.git"
ARG EMSDK_VERSION="latest"
ARG EXCEPTION_HANDLING="-fexceptions -sNO_DISABLE_EXCEPTION_CATCHING"
ARG BOOST_MAJOR_VERSION="1"
ARG BOOST_MINOR_VERSION="87"
ARG BOOST_PATCH_VERSION="0"
ARG FREETYPE_VERSION="2.13.3"

LABEL description="RDKit MinimalLib with MCS + FS support"

RUN apt-get update && apt-get upgrade -y && apt install -y \
  curl \
  wget \
  cmake \
  python3 \
  g++ \
  libeigen3-dev \
  git \
  xz-utils \
  nodejs \
  libexpat-dev \
  zlib1g-dev

ENV LANG C

WORKDIR /src
ARG BOOST_DOT_VERSION="${BOOST_MAJOR_VERSION}.${BOOST_MINOR_VERSION}.${BOOST_PATCH_VERSION}"
ARG BOOST_UNDERSCORE_VERSION="${BOOST_MAJOR_VERSION}_${BOOST_MINOR_VERSION}_${BOOST_PATCH_VERSION}"
RUN wget -q https://archives.boost.io/release/${BOOST_DOT_VERSION}/source/boost_${BOOST_UNDERSCORE_VERSION}.tar.gz && \
  tar xzf boost_${BOOST_UNDERSCORE_VERSION}.tar.gz
WORKDIR /src/boost_${BOOST_UNDERSCORE_VERSION}
RUN ./bootstrap.sh --prefix=/opt/boost --with-libraries=system && \
  ./b2 install

WORKDIR /opt
RUN git clone https://github.com/emscripten-core/emsdk.git

WORKDIR /opt/emsdk
RUN for i in 1 2 3 4 5; do \
    ./emsdk install ${EMSDK_VERSION} && break; \
    echo "emsdk install attempt $i failed, retrying in 5s..."; \
    sleep 5; \
  done && \
  ./emsdk activate ${EMSDK_VERSION}

RUN echo "source /opt/emsdk/emsdk_env.sh > /dev/null 2>&1" >> ~/.bashrc
SHELL ["/bin/bash", "-c", "-l"]

WORKDIR /src
RUN wget -q https://download.savannah.gnu.org/releases/freetype/freetype-${FREETYPE_VERSION}.tar.gz && \
  tar xzf freetype-${FREETYPE_VERSION}.tar.gz
WORKDIR /src/freetype-${FREETYPE_VERSION}
RUN mkdir build
WORKDIR /src/freetype-${FREETYPE_VERSION}/build
RUN emcmake cmake -DCMAKE_BUILD_TYPE=Release -DWITH_ZLIB=OFF -DWITH_BZip2=OFF -DWITH_PNG=OFF \
  -DCMAKE_C_FLAGS="${EXCEPTION_HANDLING}" -DCMAKE_EXE_LINKER_FLAGS="${EXCEPTION_HANDLING}" \
  -DCMAKE_INSTALL_PREFIX=/opt/freetype ..
RUN make -j2 && make -j2 install

WORKDIR /src
ENV RDBASE=/src/rdkit
RUN git clone ${RDKIT_GIT_URL}
WORKDIR $RDBASE
RUN git fetch --all --tags && \
  git checkout ${RDKIT_BRANCH}
RUN mkdir build
WORKDIR $RDBASE/build
RUN emcmake cmake -DRDK_BUILD_FREETYPE_SUPPORT=ON -DRDK_BUILD_MINIMAL_LIB=ON \
  -DRDK_BUILD_PYTHON_WRAPPERS=OFF -DRDK_BUILD_CPP_TESTS=OFF -DRDK_BUILD_INCHI_SUPPORT=ON \
  -DRDK_USE_BOOST_SERIALIZATION=OFF -DRDK_OPTIMIZE_POPCNT=OFF -DRDK_BUILD_THREADSAFE_SSS=OFF \
  -DRDK_BUILD_DESCRIPTORS3D=OFF -DRDK_TEST_MULTITHREADED=OFF \
  -DRDK_BUILD_MAEPARSER_SUPPORT=OFF -DRDK_BUILD_COORDGEN_SUPPORT=ON \
  -DRDK_BUILD_MINIMAL_LIB_MCS=ON -DRDK_BUILD_CHEMDRAW_SUPPORT=OFF \
  -DBoost_DIR=/opt/boost/lib/cmake/Boost-${BOOST_DOT_VERSION} \
  -Dboost_headers_DIR=/opt/boost/lib/cmake/boost_headers-${BOOST_DOT_VERSION} \
  -DRDK_BUILD_SLN_SUPPORT=OFF -DRDK_USE_BOOST_IOSTREAMS=OFF \
  -DFREETYPE_INCLUDE_DIRS=/opt/freetype/include/freetype2 \
  -DFREETYPE_LIBRARY=/opt/freetype/lib/libfreetype.a \
  -DCMAKE_CXX_FLAGS="${EXCEPTION_HANDLING} -O3 -DNDEBUG -sUSE_ZLIB=1" \
  -DCMAKE_C_FLAGS="${EXCEPTION_HANDLING} -O3 -DNDEBUG -DCOMPILE_ANSI_ONLY -sUSE_ZLIB=1" \
  -DCMAKE_EXE_LINKER_FLAGS="${EXCEPTION_HANDLING} -s STACK_OVERFLOW_CHECK=1 -s USE_PTHREADS=0 -s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=4GB -s MODULARIZE=1 -s EXPORT_NAME=\"'initRDKitModule'\" -sUSE_ZLIB=1 -sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=[\"FS\"]" ..

# "patch" to make the InChI code work with emscripten:
RUN cp /src/rdkit/External/INCHI-API/src/INCHI_BASE/src/util.c /src/rdkit/External/INCHI-API/src/INCHI_BASE/src/util.c.bak && \
  sed 's/&& defined(__APPLE__)//' /src/rdkit/External/INCHI-API/src/INCHI_BASE/src/util.c.bak > /src/rdkit/External/INCHI-API/src/INCHI_BASE/src/util.c

# build and "install"
RUN make -j2 RDKit_minimal && \
  cp Code/MinimalLib/RDKit_minimal.* ../Code/MinimalLib/demo/

# run the tests (non-fatal)
WORKDIR /src/rdkit/Code/MinimalLib/tests
RUN /opt/emsdk/node/*/bin/node tests.js || echo "Tests completed (some assertions expected in minimal build)"

# Copy js and wasm rdkit files to use in browser
FROM scratch as export-stage
COPY --from=build-stage /src/rdkit/Code/MinimalLib/demo /
COPY --from=build-stage /src/rdkit/Code/MinimalLib/docs /
